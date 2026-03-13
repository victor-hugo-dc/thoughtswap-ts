/*
 * ThoughtSwap
 * Copyright (C) 2026 ThoughtSwap
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import React, { useState, useEffect } from 'react';
import { ChevronDown, BookOpen, Lock, Unlock, Search, LogOut } from 'lucide-react';

interface Course {
    id: string;
    canvasId: string;
    title: string;
    semester?: string;
    teacherId: string | null;
    isActive: boolean;
}

interface StudentCourseSelectionProps {
    userEmail: string;
    userName?: string;
    onSelectCourse: (courseId: string) => void;
    onLogout?: () => void;
}

export default function StudentCourseSelection({
    userEmail,
    userName,
    onSelectCourse,
    onLogout,
}: StudentCourseSelectionProps) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [expandedSemesterId, setExpandedSemesterId] = useState<string | null>(null);
    const [roomCode, setRoomCode] = useState('');
    const [joinLoading, setJoinLoading] = useState(false);
    const [joinError, setJoinError] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch courses on mount
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                setLoading(true);
                const response = await fetch('http://localhost:8000/api/courses', {
                    method: 'GET',
                    headers: {
                        'x-user-email': userEmail,
                        'x-user-role': 'STUDENT',
                    },
                });

                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch courses: ${response.status} ${response.statusText}`
                    );
                }

                const data = await response.json();
                const sortedCourses = (data.courses || []).sort((a: Course, b: Course) => {
                    // Sort by semester first, then by title
                    const aSemester = a.semester || 'Unknown';
                    const bSemester = b.semester || 'Unknown';
                    const semesterCompare = aSemester.localeCompare(bSemester);
                    if (semesterCompare !== 0) return semesterCompare;
                    return a.title.localeCompare(b.title);
                });
                setCourses(sortedCourses);

                // Set first semester as expanded by default
                const firstSemester = [
                    ...new Set(sortedCourses.map((c) => c.semester || 'Unknown')),
                ][0];
                if (firstSemester) {
                    setExpandedSemesterId(firstSemester);
                }
            } catch (err) {
                console.error('Error fetching courses:', err);
                setError(err instanceof Error ? err.message : 'Failed to load courses');
            } finally {
                setLoading(false);
            }
        };

        fetchCourses();
    }, [userEmail]);

    const handleJoinByCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setJoinError('');
        setJoinLoading(true);

        try {
            // TODO: Implement room code join endpoint on backend
            // For now, just show a placeholder
            if (!roomCode.trim()) {
                setJoinError('Please enter a room code');
                return;
            }
            // This will be implemented after room code functionality is added
            setJoinError('Room code feature coming soon');
        } finally {
            setJoinLoading(false);
        }
    };

    const filteredCourses = courses.filter((course) =>
        course.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Group courses by semester
    const groupedBySemester = filteredCourses.reduce(
        (acc, course) => {
            const semester = course.semester || 'Unknown';
            if (!acc[semester]) {
                acc[semester] = [];
            }
            acc[semester].push(course);
            return acc;
        },
        {} as Record<string, Course[]>
    );

    // Sort semesters
    const sortedSemesters = Object.keys(groupedBySemester).sort().reverse();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading your courses...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center">
                    <div>
                        {/* <h1 className="text-3xl font-bold text-gray-900">My Courses</h1>
                        <p className="text-gray-600 mt-2">Select a course to get started</p> */}
                    </div>
                    <div className="flex items-center space-x-4">
                        {userName && (
                            <span className="text-sm font-medium text-gray-600">
                                {userName}{' '}
                                <span className="bg-gray-100 px-2 py-1 rounded text-xs ml-1 border border-gray-200">
                                    STUDENT
                                </span>
                            </span>
                        )}
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="flex items-center space-x-1 text-red-500 hover:text-red-700 transition"
                            >
                                <LogOut className="h-5 w-5" />
                                <span className="hidden sm:inline">Logout</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main courses section */}
                    <div className="lg:col-span-2">
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                                <p className="text-red-800">{error}</p>
                            </div>
                        )}

                        {/* Search bar */}
                        <div className="mb-6">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 text-gray-400 h-5 w-5" />
                                <input
                                    type="text"
                                    placeholder="Search courses..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {/* Semesters list */}
                        <div className="space-y-4">
                            {sortedSemesters.length === 0 ? (
                                <div className="bg-white rounded-lg p-8 text-center border border-gray-200">
                                    <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                    <p className="text-gray-600">
                                        {searchQuery
                                            ? 'No courses match your search'
                                            : 'No courses yet'}
                                    </p>
                                </div>
                            ) : (
                                sortedSemesters.map((semester) => (
                                    <div
                                        key={semester}
                                        className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                                    >
                                        {/* Semester accordion header */}
                                        <button
                                            onClick={() =>
                                                setExpandedSemesterId(
                                                    expandedSemesterId === semester
                                                        ? null
                                                        : semester
                                                )
                                            }
                                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3 flex-1 text-left">
                                                <BookOpen className="h-6 w-6 text-blue-600 flex-shrink-0" />
                                                <h3 className="font-semibold text-gray-900">
                                                    {semester}
                                                </h3>
                                                <span className="text-xs text-gray-500">
                                                    ({groupedBySemester[semester].length} course
                                                    {groupedBySemester[semester].length !== 1
                                                        ? 's'
                                                        : ''}
                                                    )
                                                </span>
                                            </div>
                                            <ChevronDown
                                                className={`h-5 w-5 text-gray-400 transition-transform ${
                                                    expandedSemesterId === semester
                                                        ? 'rotate-180'
                                                        : ''
                                                }`}
                                            />
                                        </button>

                                        {/* Courses grid - expanded */}
                                        {expandedSemesterId === semester && (
                                            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {groupedBySemester[semester].map((course) => (
                                                        <div
                                                            key={course.id}
                                                            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                                                        >
                                                            <div className="space-y-3">
                                                                {/* Course title */}
                                                                <div>
                                                                    <h4 className="font-semibold text-gray-900">
                                                                        {course.title}
                                                                    </h4>
                                                                </div>

                                                                {/* Course ID */}
                                                                <div>
                                                                    <p className="text-xs font-medium text-gray-600">
                                                                        Course ID
                                                                    </p>
                                                                    <p className="text-xs text-gray-500 font-mono mt-1">
                                                                        {course.canvasId}
                                                                    </p>
                                                                </div>

                                                                {/* Status */}
                                                                <div className="flex items-center gap-2">
                                                                    {course.isActive ? (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                                                                            <Unlock className="h-3 w-3" />
                                                                            Active
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
                                                                            <Lock className="h-3 w-3" />
                                                                            Inactive
                                                                        </span>
                                                                    )}
                                                                    {!course.teacherId && (
                                                                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                                                            Awaiting teacher
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Info message */}
                                                                {!course.teacherId && (
                                                                    <p className="text-xs text-blue-900 bg-blue-50 p-2 rounded">
                                                                        Waiting for a teacher to
                                                                        claim this course.
                                                                    </p>
                                                                )}

                                                                {/* Action button */}
                                                                {course.isActive && (
                                                                    <button
                                                                        onClick={() =>
                                                                            onSelectCourse(
                                                                                course.id
                                                                            )
                                                                        }
                                                                        className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                                                                    >
                                                                        Enter Course
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right sidebar - Join by room code */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">
                                Join by Room Code
                            </h2>
                            <form onSubmit={handleJoinByCode} className="space-y-4">
                                <div>
                                    <label
                                        htmlFor="roomCode"
                                        className="block text-sm font-medium text-gray-700 mb-2"
                                    >
                                        Room Code
                                    </label>
                                    <input
                                        id="roomCode"
                                        type="text"
                                        placeholder="Enter code..."
                                        value={roomCode}
                                        onChange={(e) => {
                                            setRoomCode(e.target.value.toUpperCase());
                                            setJoinError('');
                                        }}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg font-mono"
                                    />
                                </div>
                                {joinError && (
                                    <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                                        {joinError}
                                    </p>
                                )}
                                <button
                                    type="submit"
                                    disabled={joinLoading}
                                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                                >
                                    {joinLoading ? 'Joining...' : 'Join'}
                                </button>
                            </form>
                            <div className="mt-6 pt-6 border-t border-gray-200">
                                <p className="text-xs text-gray-600">
                                    <strong>Tip:</strong> Ask your teacher for the room code to join
                                    a live discussion session.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
