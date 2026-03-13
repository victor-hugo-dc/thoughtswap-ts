/*
 * ThoughtSwap
 * Copyright (C) 2026 ThoughtSwap
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { Router, Request, Response } from 'express';
import axios from 'axios';
import { PrismaClient, Prisma } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const router = Router();

const REQUIRED_SCOPES = [
    'url:GET|/api/v1/accounts/:account_id/terms',
    'url:GET|/api/v1/accounts/:account_id/terms/:id',
    'url:GET|/api/v1/courses/:course_id/enrollments',
    'url:GET|/api/v1/sections/:section_id/enrollments',
    'url:GET|/api/v1/users/:user_id/enrollments',
    'url:GET|/api/v1/courses/:course_id/sections',
    'url:GET|/api/v1/users/:user_id/profile',
    'url:GET|/api/v1/courses',
].join(' ');

// 1. Configuration Constants from .env
const {
    FRONTEND_URL,
    CANVAS_CLIENT_ID,
    CANVAS_CLIENT_SECRET,
    CANVAS_BASE_URL,
    CANVAS_REDIRECT_URI,
} = process.env;

if (!CANVAS_CLIENT_ID || !CANVAS_CLIENT_SECRET || !CANVAS_BASE_URL || !CANVAS_REDIRECT_URI) {
    throw new Error('Missing one or more Canvas OAuth environment variables.');
}

// Admin whitelist - only these emails can be admins
const ADMIN_WHITELIST = [''];

// Cache for enrollment terms to avoid repeated API calls
const termCache: { [key: number]: string } = {};

const fetchTermName = async (
    rootAccountId: number,
    termId: number,
    accessToken: string
): Promise<string> => {
    // Check cache first
    if (termCache[termId]) {
        return termCache[termId];
    }

    try {
        const termResponse = await axios.get(
            `${CANVAS_BASE_URL}/api/v1/accounts/${rootAccountId}/terms/${termId}`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );
        const termName = termResponse.data.name;
        termCache[termId] = termName;
        return termName;
    } catch (error) {
        // Silently handle errors
        return 'Unknown';
    }
};

const determineRole = async (
    userId: string,
    accessToken: string,
    email: string
): Promise<'TEACHER' | 'STUDENT' | 'ADMIN' | 'OTHER'> => {
    // Check if user is in admin whitelist
    if (ADMIN_WHITELIST.includes(email)) {
        return 'ADMIN';
    }

    const enrollmentsResponse = await axios.get(
        `${CANVAS_BASE_URL}/api/v1/users/${userId}/enrollments`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );
    const enrollments = enrollmentsResponse.data;
    const roles = enrollments.map((e: any) => e.type);
    if (roles.includes('TeacherEnrollment')) return 'TEACHER';
    if (roles.includes('StudentEnrollment')) return 'STUDENT';
    return 'OTHER';
};

const fetchUserCourses = async (userId: string, accessToken: string): Promise<any[]> => {
    try {
        const coursesResponse = await axios.get(`${CANVAS_BASE_URL}/api/v1/courses`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return coursesResponse.data || [];
    } catch (error) {
        console.error('Error fetching Canvas courses:', error);
        return [];
    }
};

router.get('/', (req: Request, res: Response) => {
    const state = 'random_state_string';

    const authUrl =
        `${CANVAS_BASE_URL}/login/oauth2/auth?` +
        `client_id=${CANVAS_CLIENT_ID}&` +
        `response_type=code&` +
        `redirect_uri=${CANVAS_REDIRECT_URI}&` +
        `state=${state}&` +
        `scope=${encodeURIComponent(REQUIRED_SCOPES)}`;

    console.log('Redirecting to Canvas Auth URL:', authUrl);
    res.redirect(authUrl);
});

router.get('/callback', async (req: Request, res: Response) => {
    console.log(req.query);
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error) {
        console.error('Canvas OAuth Error:', error);
        return res.redirect(`${FRONTEND_URL}/?error=auth_denied`);
    }

    if (!code) {
        console.error('Missing authorization code.');
        return res.redirect(`${FRONTEND_URL}/?error=no_code`);
    }

    try {
        // Step 3: Exchange the code for the Access Token
        const tokenResponse = await axios.post(
            `${CANVAS_BASE_URL}/login/oauth2/token`,
            {
                grant_type: 'authorization_code',
                client_id: CANVAS_CLIENT_ID,
                client_secret: CANVAS_CLIENT_SECRET,
                redirect_uri: CANVAS_REDIRECT_URI,
                code: code,
            },
            {
                headers: { 'Content-Type': 'application/json' },
            }
        );

        // The Canvas response includes user ID, token, refresh token, and expiration
        const { access_token, refresh_token, user } = tokenResponse.data;

        // Step 4: Use Access Token to get User Profile (needed for email)
        const profileResponse = await axios.get(`${CANVAS_BASE_URL}/api/v1/users/self/profile`, {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const canvasProfile = profileResponse.data;
        const userEmail = canvasProfile.primary_email;

        if (!user || !userEmail) {
            throw new Error('Missing primary email or user ID from Canvas profile.');
        }

        // Step 5: Determine user role (including admin check)
        const role = await determineRole(user.id, access_token, userEmail);

        // Step 6: Fetch user's Canvas courses
        const canvasCourses = await fetchUserCourses(user.id, access_token);
        for (const canvasCourse of canvasCourses) {
            // Skip courses without names
            if (!canvasCourse.name) {
                continue;
            }

            let semester = 'Unknown';
            if (canvasCourse.enrollment_term_id && canvasCourse.root_account_id) {
                try {
                    semester = await fetchTermName(
                        canvasCourse.root_account_id,
                        canvasCourse.enrollment_term_id,
                        access_token
                    );
                } catch (error) {
                    // Silently handle errors, semester remains 'Unknown'
                }
            }

            // Only log and process courses with defined semesters
            if (semester !== 'Unknown') {
                console.log('Course:', canvasCourse.name);
                console.log('Semester:', semester);
            }
        }

        console.log(termCache);

        const localUser = await prisma.user.upsert({
            where: { canvasId: String(user.id) },
            update: {
                name: user.name,
                email: userEmail,
                accessToken: access_token,
                refreshToken: refresh_token,
                role: role,
            },
            create: {
                canvasId: String(user.id),
                name: user.name,
                email: userEmail,
                accessToken: access_token,
                refreshToken: refresh_token,
                role: role,
            },
        });

        // Step 7: Sync Canvas courses to database based on role
        if (role === 'TEACHER') {
            // For teachers: create/update Course records for their courses
            for (const canvasCourse of canvasCourses) {
                // Skip courses without names
                if (!canvasCourse.name) {
                    continue;
                }

                let semester = 'Unknown';
                if (canvasCourse.enrollment_term_id && canvasCourse.root_account_id) {
                    try {
                        semester = await fetchTermName(
                            canvasCourse.root_account_id,
                            canvasCourse.enrollment_term_id,
                            access_token
                        );
                    } catch (error) {
                        // Silently handle errors, semester remains 'Unknown'
                    }
                }

                await prisma.course.upsert({
                    where: { canvasId: String(canvasCourse.id) },
                    update: { title: canvasCourse.name, semester },
                    create: {
                        canvasId: String(canvasCourse.id),
                        title: canvasCourse.name,
                        semester,
                        teacherId: localUser.id,
                    },
                });
            }
        } else if (role === 'STUDENT') {
            // For students: create courses if they don't exist, then create enrollments
            // This allows the first student to persist courses so teachers can activate them later
            for (const canvasCourse of canvasCourses) {
                // Skip courses without names
                if (!canvasCourse.name) {
                    continue;
                }

                let semester = 'Unknown';
                if (canvasCourse.enrollment_term_id && canvasCourse.root_account_id) {
                    try {
                        semester = await fetchTermName(
                            canvasCourse.root_account_id,
                            canvasCourse.enrollment_term_id,
                            access_token
                        );
                    } catch (error) {
                        // Silently handle errors, semester remains 'Unknown'
                    }
                }

                // Create or find the course
                // Note: use unchecked input to bypass Prisma's relation type validation
                // since teacherId is optional and we want it to default to null
                const dbCourse = await prisma.course.upsert({
                    where: { canvasId: String(canvasCourse.id) },
                    update: { title: canvasCourse.name, semester },
                    create: {
                        canvasId: String(canvasCourse.id),
                        title: canvasCourse.name,
                        semester,
                        // teacherId omitted - defaults to null
                    } as Prisma.CourseUncheckedCreateInput,
                });

                // Create enrollment
                await prisma.courseEnrollment.upsert({
                    where: {
                        studentId_courseId: {
                            studentId: localUser.id,
                            courseId: dbCourse.id,
                        },
                    },
                    update: {},
                    create: {
                        studentId: localUser.id,
                        courseId: dbCourse.id,
                    },
                });
            }
        }

        // Final Redirect back to the frontend (without courses - they'll be fetched via API)
        const frontendRedirect = `${FRONTEND_URL}/auth/success?name=${encodeURIComponent(localUser.name)}&role=${localUser.role}&email=${encodeURIComponent(localUser.email)}`;

        return res.redirect(frontendRedirect);
    } catch (error) {
        console.error('OAuth token exchange failed:', (error as any).message);
        return res.status(500).send('Authentication failed');
    }
});

export { router as authRouter };
