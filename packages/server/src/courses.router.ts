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
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const prisma = new PrismaClient();

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL;

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

// Helper to fetch course data from Canvas to get enrollment_term_id and root_account_id
const getCanvasCourseData = async (canvasId: string, accessToken: string): Promise<any> => {
    try {
        const response = await axios.get(`${CANVAS_BASE_URL}/api/v1/courses/${canvasId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data;
    } catch (error) {
        return null;
    }
};

// GET /courses - Get user's courses
router.get('/', async (req: Request, res: Response) => {
    try {
        const email = req.headers['x-user-email'] as string;
        const role = req.headers['x-user-role'] as string;

        if (!email) {
            return res.status(401).json({ error: 'Missing user email' });
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const formatCourse = async (course: any) => {
            let semester = course.semester || 'Unknown';

            // If semester is unknown or not set, try to fetch from Canvas
            if (semester === 'Unknown' && user.accessToken) {
                try {
                    const canvasCourse = await getCanvasCourseData(
                        course.canvasId,
                        user.accessToken
                    );
                    if (
                        canvasCourse &&
                        canvasCourse.enrollment_term_id &&
                        canvasCourse.root_account_id
                    ) {
                        semester = await fetchTermName(
                            canvasCourse.root_account_id,
                            canvasCourse.enrollment_term_id,
                            user.accessToken
                        );
                        // Update the course in the database with the fetched semester
                        await prisma.course.update({
                            where: { id: course.id },
                            data: { semester },
                        });
                    }
                } catch (error) {
                    // Silently handle errors, semester remains 'Unknown'
                }
            }

            return {
                id: course.id,
                canvasId: course.canvasId,
                title: course.title,
                semester,
                isActive: course.isActive,
            };
        };

        if (user.role === 'TEACHER') {
            // Teachers see their courses
            const courses = await prisma.course.findMany({
                where: { teacherId: user.id },
            });
            const formattedCourses = await Promise.all(
                courses.map((course) => formatCourse(course))
            );
            return res.json({ courses: formattedCourses });
        } else if (user.role === 'STUDENT') {
            // Students see courses they're enrolled in
            const enrollments = await prisma.courseEnrollment.findMany({
                where: { studentId: user.id },
                include: { course: true },
            });
            const formattedCourses = await Promise.all(
                enrollments.map((enrollment) => formatCourse(enrollment.course))
            );
            return res.json({ courses: formattedCourses });
        } else {
            // Admins can see all courses
            const courses = await prisma.course.findMany({});
            const formattedCourses = await Promise.all(
                courses.map((course) => formatCourse(course))
            );
            return res.json({ courses: formattedCourses });
        }
    } catch (error) {
        console.error('Error fetching courses:', error);
        return res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

// POST /courses/:courseId/activate - Activate a course (teacher only)
router.post('/:courseId/activate', async (req: Request, res: Response) => {
    try {
        const email = req.headers['x-user-email'] as string;
        const { courseId } = req.params;

        if (!email) {
            return res.status(401).json({ error: 'Missing user email' });
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user || user.role !== 'TEACHER') {
            return res.status(403).json({ error: 'Only teachers can activate courses' });
        }

        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        if (course.teacherId !== user.id) {
            return res
                .status(403)
                .json({ error: 'You do not have permission to activate this course' });
        }

        const updatedCourse = await prisma.course.update({
            where: { id: courseId },
            data: { isActive: true },
        });

        return res.json(updatedCourse);
    } catch (error) {
        console.error('Error activating course:', error);
        return res.status(500).json({ error: 'Failed to activate course' });
    }
});

// POST /courses/:courseId/deactivate - Deactivate a course (teacher only)
router.post('/:courseId/deactivate', async (req: Request, res: Response) => {
    try {
        const email = req.headers['x-user-email'] as string;
        const { courseId } = req.params;

        if (!email) {
            return res.status(401).json({ error: 'Missing user email' });
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user || user.role !== 'TEACHER') {
            return res.status(403).json({ error: 'Only teachers can deactivate courses' });
        }

        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        if (course.teacherId !== user.id) {
            return res
                .status(403)
                .json({ error: 'You do not have permission to deactivate this course' });
        }

        const updatedCourse = await prisma.course.update({
            where: { id: courseId },
            data: { isActive: false },
        });

        return res.json(updatedCourse);
    } catch (error) {
        console.error('Error deactivating course:', error);
        return res.status(500).json({ error: 'Failed to deactivate course' });
    }
});

export { router as coursesRouter };
