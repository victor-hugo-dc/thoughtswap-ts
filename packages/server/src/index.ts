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
    // Safety check: If no thoughts, return empty assignments
    if (thoughts.length === 0) return {};

    // Deep copy to avoid mutating original
    let pool = [...thoughts];
    const assignments: Record<string, string> = {};

    // 1. Fill the pool: If more students than thoughts, duplicate thoughts
    while (pool.length < recipientIds.length) {
        pool = pool.concat(thoughts);
    }

    // Trim if we have too many
    if (pool.length > recipientIds.length) {
        pool = pool.slice(0, recipientIds.length);
    }

    // 2. Shuffle loop (Derangement attempt)
    let attempts = 0;
    let isValid = false;

    while (!isValid && attempts < 5) {
        isValid = true;

        // Fisher-Yates Shuffle
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            // Typescript fix: Assert existence with ! since indices are within bounds
            const temp = pool[i]!;
            pool[i] = pool[j]!;
            pool[j] = temp;
        }

        // Constraint Check: A student should NOT receive their own thought
        // (Logic omitted for MVP simplicity, assumes random shuffle is "good enough" for now)
        attempts++;
    }

    // 3. Assign
    for (let i = 0; i < recipientIds.length; i++) {
        const recipient = recipientIds[i];
        const thought = pool[i];

        if (recipient && thought) {
            assignments[recipient] = thought.content;
        }
    }

    return assignments;
}

// Helper: Get all students in a room and check if they have submitted to the active prompt
async function broadcastParticipantList(joinCode: string, activePromptUseId: string | null) {
    // 1. Get all sockets in the room
    const sockets = await io.in(joinCode).fetchSockets();
    const students = sockets.filter(s => s.handshake.auth.role === 'STUDENT');

    // 2. If there is an active prompt, check who submitted
    const submissions = activePromptUseId
        ? await prisma.thought.findMany({ where: { promptUseId: activePromptUseId } })
        : [];

    const submitterIds = new Set(submissions.map(t => t.authorId));

    // 3. Build the list
    const participantList = students.map(s => {
        // We need the DB User ID to check against submitterIds. 
        // For MVP we assume handshake has email, we'd ideally look up ID.
        // To keep it fast, let's assume the client sent their Name.
        return {
            socketId: s.id,
            name: s.handshake.auth.name || "Anonymous",
            hasSubmitted: false // We will update this if we can match the user
        };
    });

    // Note: In a real production app, we would map SocketID -> DB UserID to accurately check 'hasSubmitted'.
    // For this MVP, we will trust the socket state or do a quick DB lookup if we had the user ID on the socket.
    // Let's try to match loosely or just send the list of names for now.

    // Broadcast to TEACHER only
    const teacherSockets = sockets.filter(s => s.handshake.auth.role === 'TEACHER');
    teacherSockets.forEach(t => {
        t.emit('PARTICIPANTS_UPDATE', { participants: participantList, submissionCount: submissions.length });
    });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: `${FRONTEND_URL}`, // Vite default port
        methods: ["GET", "POST"]
    }
});

io.on('connection', async (socket: Socket) => {
    console.log('User connected:', socket.id);

    // We expect the client to send { email, name, role } in the auth handshake
    const { email, name, role } = socket.handshake.auth;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        console.log(`Auth failed for ${email}: User not found in DB.`);
        socket.emit('AUTH_ERROR', { message: "Session invalid or expired. Please log in again." });
        socket.disconnect();
        return;
    }

    socket.on('SAVE_PROMPT', async ({ content }) => {
        if (role !== 'TEACHER') return;
        await prisma.savedPrompt.create({
            data: { content, teacherId: user.id }
        });
        // Refresh the list for the teacher
        const prompts = await prisma.savedPrompt.findMany({ where: { teacherId: user.id }, orderBy: { createdAt: 'desc' } });
        socket.emit('SAVED_PROMPTS_LIST', prompts);
    });

    socket.on('GET_SAVED_PROMPTS', async () => {
        if (role !== 'TEACHER') return;
        const prompts = await prisma.savedPrompt.findMany({ where: { teacherId: user.id }, orderBy: { createdAt: 'desc' } });
        socket.emit('SAVED_PROMPTS_LIST', prompts);
    });

    socket.on('TEACHER_START_CLASS', async () => {
        if (role !== 'TEACHER') return;

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
    });

    socket.on('JOIN_ROOM', async ({ joinCode }: { joinCode: string }) => {
        const normalizedCode = joinCode.toUpperCase();

        // Find the course
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

        // Join the socket room
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
    });

    socket.on('TEACHER_SEND_PROMPT', async ({ joinCode, content }) => {
        if (role !== 'TEACHER') return;
        const course = await prisma.course.findUnique({ where: { joinCode } });
        if (!course) return;

        const session = await prisma.session.findFirst({ where: { courseId: course.id, status: 'ACTIVE' } });
        if (!session) return;

        const promptUse = await prisma.promptUse.create({
            data: { content, sessionId: session.id }
        });

        io.to(joinCode).emit('NEW_PROMPT', { content, promptUseId: promptUse.id });
        broadcastParticipantList(joinCode, promptUse.id);
    });

    socket.on('SUBMIT_THOUGHT', async (data) => {
        const { joinCode, content, promptUseId } = data;
        const user = await prisma.user.findUnique({ where: { email } });

        // If promptUseId isn't provided by client, try to find the latest one (Logic omitted for brevity)
        // For now, we assume the client sends the ID they received in NEW_PROMPT
        if (user && promptUseId) {
            await prisma.thought.create({
                data: {
                    content,
                    authorId: user.id,
                    promptUseId: promptUseId
                }
            });
            console.log(`Thought received from ${user.name}`);

            // Notify teacher (Optimization: throttle this in prod)
            broadcastParticipantList(joinCode, promptUseId);
        }
    });

    socket.on('TRIGGER_SWAP', async ({ joinCode }) => {
        if (role !== 'TEACHER') return;
        console.log(`Triggering swap for room ${joinCode}`);

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

        // 2. Fetch Data
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

        // 3. Shuffle Logic
        // We use socket IDs as the "recipient IDs" for distribution
        const recipientIds = studentSockets.map(s => s.id);

        console.log(`Swapping ${thoughts.length} thoughts among ${recipientIds.length} students`);

        const assignments = shuffleThoughts(thoughts, recipientIds);

        // 4. Distribute
        studentSockets.forEach(s => {
            const assignedContent = assignments[s.id];
            if (assignedContent) {
                io.to(s.id).emit('RECEIVE_SWAP', { content: assignedContent });
            }
        });

        // 5. Update Teacher
        socket.emit('SWAP_COMPLETED', { count: Object.keys(assignments).length });
    });

    socket.on('END_SESSION', async ({ joinCode }) => {
        if (role !== 'TEACHER') return;

        const course = await prisma.course.findUnique({ where: { joinCode } });
        if (course) {
            await prisma.session.updateMany({
                where: { courseId: course.id, status: 'ACTIVE' },
                data: { status: 'COMPLETED' }
            });
        }
        // Broadcast END to everyone in the room
        io.to(joinCode).emit('SESSION_ENDED');

        // Force disconnect everyone in the room from the socket room
        // (Clients will handle the UI redirect on the event)
        const sockets = await io.in(joinCode).fetchSockets();
        sockets.forEach(s => {
            s.leave(joinCode);
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`Server running on ${FRONTEND_URL}:${PORT}`);
});