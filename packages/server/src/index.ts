import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './auth.router.js';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const {
    FRONTEND_URL,
} = process.env;

const app = express();
const prisma = new PrismaClient();
app.use(cors());
app.use(express.json());

app.use('/accounts/canvas/login', authRouter);

// --- Logging Helper ---
async function logEvent(event: string, userId: string | null, payload: any) {
    try {
        await prisma.log.create({
            data: {
                event,
                userId,
                payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined
            }
        });
    } catch (e) {
        console.error("Logging failed:", e);
    }
}

function generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function shuffleThoughts(
    thoughts: { content: string, authorId: string }[],
    recipientIds: string[]
): Record<string, string> {
    if (thoughts.length === 0) return {};

    let pool = [...thoughts];
    const assignments: Record<string, string> = {};

    // Fill pool
    while (pool.length < recipientIds.length) {
        pool = pool.concat(thoughts);
    }
    if (pool.length > recipientIds.length) {
        pool = pool.slice(0, recipientIds.length);
    }

    // Simple Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = pool[i]!;
        pool[i] = pool[j]!;
        pool[j] = temp;
    }

    // Assign
    for (let i = 0; i < recipientIds.length; i++) {
        const recipient = recipientIds[i];
        const thought = pool[i];
        if (recipient && thought) {
            assignments[recipient] = thought.content;
        }
    }

    return assignments;
}

// Broadcast Roster
async function broadcastParticipantList(joinCode: string, activePromptUseId: string | null) {
    const sockets = await io.in(joinCode).fetchSockets();
    const students = sockets.filter(s => s.handshake.auth.role === 'STUDENT');

    const submissions = activePromptUseId
        ? await prisma.thought.findMany({ where: { promptUseId: activePromptUseId } })
        : [];

    const participantList = students.map(s => {
        return {
            socketId: s.id,
            name: s.handshake.auth.name || "Anonymous",
            hasSubmitted: false 
        };
    });

    const teacherSockets = sockets.filter(s => s.handshake.auth.role === 'TEACHER');
    teacherSockets.forEach(t => {
        t.emit('PARTICIPANTS_UPDATE', { participants: participantList, submissionCount: submissions.length });
    });
}

// Broadcast Thoughts to Teacher (for Moderation)
async function broadcastThoughtsList(joinCode: string, promptUseId: string) {
    const thoughts = await prisma.thought.findMany({
        where: { promptUseId },
        include: { author: true }
    });

    // Anonymize for the view, or keep name if needed. Let's send basic info.
    const thoughtData = thoughts.map(t => ({
        id: t.id,
        content: t.content,
        authorName: t.author.name
    }));

    const teacherSockets = (await io.in(joinCode).fetchSockets()).filter(s => s.handshake.auth.role === 'TEACHER');
    teacherSockets.forEach(t => {
        t.emit('THOUGHTS_UPDATE', thoughtData);
    });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: `${FRONTEND_URL}`, 
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket: Socket) => {
    console.log('User connected:', socket.id);

    const { email, name, role } = socket.handshake.auth;

    // --- 1. Initiate User Loading immediately ---
    const userPromise = (async () => {
        if (!email) return null;
        try {
            if (email.startsWith('guest_')) {
                return await prisma.user.upsert({
                    where: { email },
                    update: { name, role },
                    create: {
                        email,
                        name,
                        role,
                        canvasId: `guest-${Math.random().toString(36).substring(7)}`,
                        accessToken: 'guest-token'
                    }
                });
            } else {
                return await prisma.user.findUnique({ where: { email } });
            }
        } catch (e) {
            console.error("User load error", e);
            return null;
        }
    })();

    // --- 2. Handle Connection/Auth Result ---
    userPromise.then((user) => {
        if (!user) {
            console.log(`Auth failed for ${email}`);
            socket.emit('AUTH_ERROR', { message: "Session invalid. Please log in again." });
            socket.disconnect();
        } else {
            logEvent('USER_CONNECT', user.id, { socketId: socket.id, role });
        }
    });

    // --- 3. Register Event Handlers Synchronously ---
    // All handlers must await userPromise to ensure auth is complete before acting.

    socket.on('SAVE_PROMPT', async ({ content }) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;
        
        await prisma.savedPrompt.create({
            data: { content, teacherId: user.id }
        });
        const prompts = await prisma.savedPrompt.findMany({ where: { teacherId: user.id }, orderBy: { createdAt: 'desc' } });
        socket.emit('SAVED_PROMPTS_LIST', prompts);
        logEvent('SAVE_PROMPT', user.id, { content });
    });

    socket.on('GET_SAVED_PROMPTS', async () => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;
        const prompts = await prisma.savedPrompt.findMany({ where: { teacherId: user.id }, orderBy: { createdAt: 'desc' } });
        socket.emit('SAVED_PROMPTS_LIST', prompts);
    });

    socket.on('TEACHER_START_CLASS', async () => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;

        let joinCode = generateRoomCode();
        let attempts = 0;
        while ((await prisma.course.findUnique({ where: { joinCode } })) && attempts < 10) {
            joinCode = generateRoomCode();
            attempts++;
        }

        const course = await prisma.course.create({
            data: {
                title: `${name}'s Class ${new Date().toLocaleDateString()}`,
                joinCode: joinCode,
                teacherId: user.id
            }
        });

        const session = await prisma.session.create({
            data: { courseId: course.id, status: 'ACTIVE' }
        });

        socket.join(course.joinCode);
        socket.emit('CLASS_STARTED', { joinCode: course.joinCode, sessionId: session.id });
        broadcastParticipantList(course.joinCode, null);
        
        logEvent('START_CLASS', user.id, { joinCode, sessionId: session.id });
    });

    socket.on('JOIN_ROOM', async ({ joinCode }: { joinCode: string }) => {
        const user = await userPromise;
        if (!user) return; // Wait for auth

        const normalizedCode = joinCode.toUpperCase();

        const course = await prisma.course.findUnique({
            where: { joinCode: normalizedCode }
        });

        if (!course) {
            socket.emit('ERROR', { message: "Invalid Room Code" });
            return;
        }

        const session = await prisma.session.findFirst({
            where: { courseId: course.id, status: 'ACTIVE' }
        });

        if (!session) {
            socket.emit('ERROR', { message: "This class session has ended." });
            return;
        }

        socket.join(normalizedCode);
        socket.emit('JOIN_SUCCESS', { joinCode: normalizedCode, courseTitle: course.title });

        const activePrompt = await prisma.promptUse.findFirst({
            where: { sessionId: session.id },
            orderBy: { id: 'desc' }
        });
        if (activePrompt) {
            socket.emit('NEW_PROMPT', { content: activePrompt.content, promptUseId: activePrompt.id });
        }

        broadcastParticipantList(normalizedCode, activePrompt ? activePrompt.id : null);
        logEvent('JOIN_ROOM', user.id, { joinCode: normalizedCode });
    });

    socket.on('TEACHER_SEND_PROMPT', async ({ joinCode, content }) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;

        const course = await prisma.course.findUnique({ where: { joinCode } });
        if (!course) return;

        const session = await prisma.session.findFirst({ where: { courseId: course.id, status: 'ACTIVE' } });
        if (!session) return;

        const promptUse = await prisma.promptUse.create({
            data: { content, sessionId: session.id }
        });

        io.to(joinCode).emit('NEW_PROMPT', { content, promptUseId: promptUse.id });
        broadcastParticipantList(joinCode, promptUse.id);
        
        // Clear teacher's thought view for new prompt
        socket.emit('THOUGHTS_UPDATE', []); 
        
        logEvent('SEND_PROMPT', user.id, { joinCode, promptUseId: promptUse.id, content });
    });

    socket.on('SUBMIT_THOUGHT', async (data) => {
        const user = await userPromise;
        if (!user) return;

        const { joinCode, content, promptUseId } = data;
        
        if (promptUseId) {
            await prisma.thought.create({
                data: {
                    content,
                    authorId: user.id,
                    promptUseId: promptUseId
                }
            });
            
            broadcastParticipantList(joinCode, promptUseId);
            broadcastThoughtsList(joinCode, promptUseId);
            
            logEvent('SUBMIT_THOUGHT', user.id, { joinCode, promptUseId });
        }
    });

    socket.on('TEACHER_DELETE_THOUGHT', async ({ joinCode, thoughtId }) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;

        try {
            const thought = await prisma.thought.findUnique({ where: { id: thoughtId }, include: { promptUse: true } });
            if (thought) {
                await prisma.thought.delete({ where: { id: thoughtId } });
                broadcastThoughtsList(joinCode, thought.promptUseId);
                broadcastParticipantList(joinCode, thought.promptUseId);
                logEvent('DELETE_THOUGHT', user.id, { thoughtId, content: thought.content });
            }
        } catch(e) {
            console.error("Delete failed", e);
        }
    });

    socket.on('TRIGGER_SWAP', async ({ joinCode }) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;
        
        const course = await prisma.course.findUnique({ where: { joinCode } });
        if (!course) return;

        const session = await prisma.session.findFirst({ where: { courseId: course.id, status: 'ACTIVE' } });
        if (!session) return;

        const promptUse = await prisma.promptUse.findFirst({
            where: { sessionId: session.id },
            orderBy: { id: 'desc' }
        });
        if (!promptUse) {
            socket.emit('ERROR', { message: "No active prompt found to swap." });
            return;
        }

        const thoughts = await prisma.thought.findMany({
            where: { promptUseId: promptUse.id },
            select: { content: true, authorId: true }
        });

        const sockets = await io.in(joinCode).fetchSockets();
        const studentSockets = sockets.filter(s => s.handshake.auth.role === 'STUDENT');

        if (thoughts.length === 0) {
            socket.emit('ERROR', { message: "No thoughts submitted yet!" });
            return;
        }

        const recipientIds = studentSockets.map(s => s.id);
        const assignments = shuffleThoughts(thoughts, recipientIds);

        studentSockets.forEach(s => {
            const assignedContent = assignments[s.id];
            if (assignedContent) {
                io.to(s.id).emit('RECEIVE_SWAP', { content: assignedContent });
            }
        });

        socket.emit('SWAP_COMPLETED', { count: Object.keys(assignments).length });
        logEvent('TRIGGER_SWAP', user.id, { joinCode, count: Object.keys(assignments).length });
    });

    socket.on('STUDENT_REQUEST_NEW_THOUGHT', async ({ joinCode, currentThoughtContent }) => {
        const user = await userPromise;
        if (!user || role !== 'STUDENT') return;

        const course = await prisma.course.findUnique({ where: { joinCode } });
        if (!course) return;
        const session = await prisma.session.findFirst({ where: { courseId: course.id, status: 'ACTIVE' } });
        if (!session) return;
        const promptUse = await prisma.promptUse.findFirst({ where: { sessionId: session.id }, orderBy: { id: 'desc' } });
        if (!promptUse) return;

        const allThoughts = await prisma.thought.findMany({
            where: { 
                promptUseId: promptUse.id,
                authorId: { not: user.id } 
            }
        });

        if (allThoughts.length > 0) {
            const randomThought = allThoughts[Math.floor(Math.random() * allThoughts.length)];
            socket.emit('RECEIVE_SWAP', { content: randomThought!.content });
            logEvent('REQUEST_RESWAP', user.id, { joinCode });
        } else {
            socket.emit('ERROR', { message: "No other thoughts available to swap." });
        }
    });

    socket.on('END_SESSION', async ({ joinCode }) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;

        const course = await prisma.course.findUnique({ where: { joinCode } });
        if (course) {
            await prisma.session.updateMany({
                where: { courseId: course.id, status: 'ACTIVE' },
                data: { status: 'COMPLETED' }
            });
        }
        io.to(joinCode).emit('SESSION_ENDED');
        const sockets = await io.in(joinCode).fetchSockets();
        sockets.forEach(s => {
            s.leave(joinCode);
        });
        logEvent('END_SESSION', user.id, { joinCode });
    });

    socket.on('disconnect', () => {
        // console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`Server running on ${FRONTEND_URL}:${PORT}`);
});