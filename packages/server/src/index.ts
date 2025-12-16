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
    thoughts: { content: string, authorId: string, authorName?: string }[],
    recipientIds: string[]
): Record<string, any> {
    if (thoughts.length === 0) return {};

    let pool = [...thoughts];
    const assignments: Record<string, any> = {};

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
            assignments[recipient] = {
                content: thought.content,
                authorId: thought.authorId,
                originalAuthorName: thought.authorName
            };
        }
    }

    return assignments;
}

// Global variable to store current assignments in memory for the facilitator view (for MVP)
// structure: { [joinCode]: { [studentSocketId]: { studentName, thoughtContent, originalAuthorName } } }
const roomAssignments: Record<string, Record<string, any>> = {};

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

        // Also send distribution if it exists
        if (roomAssignments[joinCode]) {
            t.emit('DISTRIBUTION_UPDATE', roomAssignments[joinCode]);
        }
    });
}

// Broadcast Thoughts to Teacher (for Moderation)
async function broadcastThoughtsList(joinCode: string, promptUseId: string) {
    const thoughts = await prisma.thought.findMany({
        where: { promptUseId },
        include: { author: true }
    });

    // Anonymize for the view, or keep name if needed.
    const thoughtData = thoughts.map(t => ({
        id: t.id,
        content: t.content,
        authorName: t.author.name,
        authorId: t.authorId 
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
            socket.emit('AUTH_ERROR', { message: "Session invalid. Please log in again." });
            socket.disconnect();
        } else {
            socket.data.userId = user.id; 
            socket.data.userName = user.name;
            socket.emit('CONSENT_STATUS', { 
                consentGiven: user.consentGiven, 
                consentDate: user.consentDate 
            });

            logEvent('USER_CONNECT', user.id, { socketId: socket.id, role });
        }
    });

    // --- CONSENT HANDLING ---
    socket.on('UPDATE_CONSENT', async ({ consentGiven }) => {
        const user = await userPromise;
        if (!user) return;

        await prisma.user.update({
            where: { id: user.id },
            data: { consentGiven, consentDate: new Date() }
        });

        logEvent('UPDATE_CONSENT', user.id, { consentGiven });
        socket.emit('CONSENT_STATUS', { consentGiven, consentDate: new Date() });
    });

    // --- PROMPT BANK CRUD ---
    socket.on('GET_SAVED_PROMPTS', async () => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;
        const prompts = await prisma.savedPrompt.findMany({ where: { teacherId: user.id }, orderBy: { createdAt: 'desc' } });
        socket.emit('SAVED_PROMPTS_LIST', prompts);
    });

    socket.on('SAVE_PROMPT', async (data) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;
        
        // Data can have type and options now
        const { content, type = "TEXT", options = [] } = data;

        await prisma.savedPrompt.create({
            data: { 
                content, 
                type, 
                options: options || [],
                teacherId: user.id 
            }
        });
        const prompts = await prisma.savedPrompt.findMany({ where: { teacherId: user.id }, orderBy: { createdAt: 'desc' } });
        socket.emit('SAVED_PROMPTS_LIST', prompts);
        logEvent('SAVE_PROMPT', user.id, { content, type });
    });

    socket.on('DELETE_SAVED_PROMPT', async ({ id }) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;

        try {
            const prompt = await prisma.savedPrompt.findUnique({ where: { id } });
            if (prompt && prompt.teacherId === user.id) {
                await prisma.savedPrompt.delete({ where: { id } });
                const prompts = await prisma.savedPrompt.findMany({ where: { teacherId: user.id }, orderBy: { createdAt: 'desc' } });
                socket.emit('SAVED_PROMPTS_LIST', prompts);
            }
        } catch (e) {
            console.error("Delete prompt failed", e);
        }
    });

    // --- CLASS MANAGEMENT ---
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
            data: { 
                courseId: course.id, 
                status: 'ACTIVE',
                maxSwapRequests: 1 
            }
        });

        // Initialize assignments for this room
        roomAssignments[joinCode] = {};

        socket.join(course.joinCode);
        socket.emit('CLASS_STARTED', { 
            joinCode: course.joinCode, 
            sessionId: session.id,
            maxSwapRequests: session.maxSwapRequests 
        });

        broadcastParticipantList(course.joinCode, null);
        logEvent('START_CLASS', user.id, { joinCode, sessionId: session.id });
    });

    socket.on('UPDATE_SESSION_SETTINGS', async ({ joinCode, maxSwapRequests }) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;

        const course = await prisma.course.findUnique({ where: { joinCode } });
        if (!course) return;

        const session = await prisma.session.findFirst({ where: { courseId: course.id, status: 'ACTIVE' } });
        if (session) {
            await prisma.session.update({
                where: { id: session.id },
                data: { maxSwapRequests: parseInt(maxSwapRequests) || 1 }
            });
            logEvent('UPDATE_SETTINGS', user.id, { joinCode, maxSwapRequests });
        }
    });

    // New: Allow teacher to rejoin their own active session
    socket.on('TEACHER_REJOIN', async ({ joinCode }) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;

        const course = await prisma.course.findUnique({ where: { joinCode } });
        if (!course || course.teacherId !== user.id) {
            socket.emit('ERROR', { message: "Invalid session or unauthorized." });
            return;
        }

        const session = await prisma.session.findFirst({ where: { courseId: course.id, status: 'ACTIVE' } });
        if (!session) {
            socket.emit('ERROR', { message: "Session ended." });
            return;
        }

        socket.join(joinCode);
        socket.emit('CLASS_STARTED', { 
            joinCode: course.joinCode, 
            sessionId: session.id,
            maxSwapRequests: session.maxSwapRequests 
        });

        // Restore state
        const activePrompt = await prisma.promptUse.findFirst({
            where: { sessionId: session.id },
            orderBy: { id: 'desc' }
        });

        if (activePrompt) {
            broadcastParticipantList(joinCode, activePrompt.id);
            // Send existing thoughts to teacher
            const thoughts = await prisma.thought.findMany({
                where: { promptUseId: activePrompt.id },
                include: { author: true }
            });
            const thoughtData = thoughts.map(t => ({
                id: t.id,
                content: t.content,
                authorName: t.author.name
            }));
            socket.emit('THOUGHTS_UPDATE', thoughtData);
        } else {
            broadcastParticipantList(joinCode, null);
        }
    });

    socket.on('JOIN_ROOM', async ({ joinCode }: { joinCode: string }) => {
        const user = await userPromise;
        if (!user) return; 

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

        // Restore Student State
        const activePrompt = await prisma.promptUse.findFirst({
            where: { sessionId: session.id },
            orderBy: { id: 'desc' }
        });
        
        if (activePrompt) {
            // Check if student already submitted
            const existingThought = await prisma.thought.findFirst({
                where: { promptUseId: activePrompt.id, authorId: user.id }
            });

            if (existingThought) {
                // Check if they were already part of a distribution
                if (roomAssignments[normalizedCode] && roomAssignments[normalizedCode][socket.id]) {
                     const assignment = roomAssignments[normalizedCode][socket.id];
                     socket.emit('RECEIVE_SWAP', { content: assignment.content });
                     socket.emit('RESTORE_STATE', { 
                        status: 'DISCUSSING', 
                        prompt: activePrompt.content, 
                        promptUseId: activePrompt.id,
                        type: activePrompt.type,
                        options: activePrompt.options 
                    });
                } else {
                    socket.emit('RESTORE_STATE', { 
                        status: 'SUBMITTED', 
                        prompt: activePrompt.content, 
                        promptUseId: activePrompt.id,
                        type: activePrompt.type,
                        options: activePrompt.options 
                    });
                }
            } else {
                socket.emit('NEW_PROMPT', { 
                    content: activePrompt.content, 
                    promptUseId: activePrompt.id,
                    type: activePrompt.type,
                    options: activePrompt.options
                });
            }
        }

        broadcastParticipantList(normalizedCode, activePrompt ? activePrompt.id : null);
        logEvent('JOIN_ROOM', user.id, { joinCode: normalizedCode });
    });

    socket.on('TEACHER_SEND_PROMPT', async (data) => {
        const user = await userPromise;
        if (!user || role !== 'TEACHER') return;

        // Extract type and options, default to TEXT
        const { joinCode, content, type = "TEXT", options = [] } = data;

        const course = await prisma.course.findUnique({ where: { joinCode } });
        if (!course) return;

        const session = await prisma.session.findFirst({ where: { courseId: course.id, status: 'ACTIVE' } });
        if (!session) return;

        const promptUse = await prisma.promptUse.create({
            data: { 
                content, 
                sessionId: session.id,
                type,
                options: options || []
            }
        });

        // Reset assignments for new prompt
        roomAssignments[joinCode] = {};

        io.to(joinCode).emit('NEW_PROMPT', { 
            content, 
            promptUseId: promptUse.id,
            type,
            options
        });
        
        broadcastParticipantList(joinCode, promptUse.id);
        socket.emit('THOUGHTS_UPDATE', []); 
        logEvent('SEND_PROMPT', user.id, { joinCode, promptUseId: promptUse.id, content, type });
    });

    socket.on('SUBMIT_THOUGHT', async (data) => {
        const user = await userPromise;
        if (!user) return;

        const { joinCode, content, promptUseId } = data;
        
        if (promptUseId) {
            // Upsert to prevent duplicates if network is flakey
            await prisma.thought.create({
                data: {
                    content, // For MC/Scale this will be "Option A" or "5"
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
                const sockets = await io.in(joinCode).fetchSockets();
                const authorSocket = sockets.find(s => s.data.userId === thought.authorId);
                await prisma.thought.delete({ where: { id: thoughtId } });

                broadcastThoughtsList(joinCode, thought.promptUseId);
                broadcastParticipantList(joinCode, thought.promptUseId);

                if (authorSocket) {
                    authorSocket.emit('THOUGHT_DELETED', { message: "Your response was removed by the facilitator. Please submit a new one." });
                }

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

        const promptUse = await prisma.promptUse.findFirst({ where: { sessionId: session.id }, orderBy: { id: 'desc' } });
        if (!promptUse) {
            socket.emit('ERROR', { message: "No active prompt found to swap." });
            return;
        }

        const thoughts = await prisma.thought.findMany({
            where: { promptUseId: promptUse.id },
            include: { author: true }
        });

        const sockets = await io.in(joinCode).fetchSockets();
        const studentSockets = sockets.filter(s => s.handshake.auth.role === 'STUDENT');

        if (thoughts.length === 0) {
            socket.emit('ERROR', { message: "No thoughts submitted yet!" });
            return;
        }

        const thoughtsForShuffle = thoughts.map(t => ({
            content: t.content,
            authorId: t.authorId,
            authorName: t.author.name
        }));

        const recipientIds = studentSockets.map(s => s.id);
        const assignments = shuffleThoughts(thoughtsForShuffle, recipientIds);

        studentSockets.forEach(s => {
            const assignedData = assignments[s.id];
            if (assignedData) {
                if (!roomAssignments[joinCode]) roomAssignments[joinCode] = {};
                roomAssignments[joinCode][s.id] = {
                    studentName: s.handshake.auth.name || "Anonymous",
                    thoughtContent: assignedData.content,
                    originalAuthorName: assignedData.originalAuthorName
                };
                io.to(s.id).emit('RECEIVE_SWAP', { content: assignedData.content });
            }
        });

        const teacherSockets = sockets.filter(s => s.handshake.auth.role === 'TEACHER');
        teacherSockets.forEach(t => {
            t.emit('DISTRIBUTION_UPDATE', roomAssignments[joinCode]);
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

        const requestsCount = await prisma.swapRequest.count({
            where: { studentId: user.id, sessionId: session.id }
        });

        if (requestsCount >= session.maxSwapRequests) {
            socket.emit('ERROR', { message: `Limit reached. You can only request a change ${session.maxSwapRequests} time(s).` });
            return;
        }

        const allThoughts = await prisma.thought.findMany({
            where: { promptUseId: promptUse.id, authorId: { not: user.id } },
            include: { author: true }
        });

        const available = allThoughts.filter(t => t.content !== currentThoughtContent);

        if (available.length > 0) {
            const randomThought = available[Math.floor(Math.random() * available.length)];
            await prisma.swapRequest.create({
                data: { studentId: user.id, sessionId: session.id }
            });

            if (roomAssignments[joinCode] && roomAssignments[joinCode][socket.id]) {
                roomAssignments[joinCode][socket.id] = {
                    studentName: socket.handshake.auth.name || "Anonymous",
                    thoughtContent: randomThought!.content,
                    originalAuthorName: randomThought!.author.name
                };
                const sockets = await io.in(joinCode).fetchSockets();
                const teacherSockets = sockets.filter(s => s.handshake.auth.role === 'TEACHER');
                teacherSockets.forEach(t => {
                    t.emit('DISTRIBUTION_UPDATE', roomAssignments[joinCode]);
                });
            }

            socket.emit('RECEIVE_SWAP', { content: randomThought!.content });
            logEvent('REQUEST_RESWAP', user.id, { joinCode });
        } else {
            socket.emit('ERROR', { message: "No other different thoughts available to swap." });
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

        // Survey Link
        const surveyLink = "https://jmu.qualtrics.com/jfe/form/SV_dummy_survey_id";

        io.to(joinCode).emit('SESSION_ENDED', { surveyLink });
        const sockets = await io.in(joinCode).fetchSockets();
        sockets.forEach(s => { s.leave(joinCode); });
        if (roomAssignments[joinCode]) delete roomAssignments[joinCode];

        logEvent('END_SESSION', user.id, { joinCode });
    });

    socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`Server running on ${FRONTEND_URL}:${PORT}`);
});