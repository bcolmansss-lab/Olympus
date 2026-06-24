/**
 * TrainingManager — employee training programs, course enrollment,
 * certification tracking, skill development paths, and completion analytics.
 *
 * Events:
 *   - "training.enrollment_created": { enrollmentId, employeeId, courseId, courseName }
 *   - "training.course_completed": { enrollmentId, employeeId, courseId, score }
 *   - "training.certification_earned": { employeeId, certificationId, name, expiresAt }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type CourseStatus = "draft" | "published" | "archived";
export type EnrollmentStatus = "enrolled" | "in_progress" | "completed" | "failed" | "dropped";
export type DeliveryMode = "online" | "in_person" | "hybrid" | "self_paced";

export interface TrainingCourse {
  id: string;
  name: string;
  description: string;
  category: string;
  status: CourseStatus;
  deliveryMode: DeliveryMode;
  durationHours: number;
  passingScore: number;
  mandatory: boolean;
  createdAt: string;
}

export interface TrainingEnrollment {
  id: string;
  employeeId: string;
  courseId: string;
  courseName: string;
  status: EnrollmentStatus;
  score?: number;
  enrolledAt: string;
  completedAt?: string;
  dueDate?: string;
}

export interface Certification {
  id: string;
  employeeId: string;
  name: string;
  issuedBy: string;
  issuedAt: string;
  expiresAt?: string;
  courseId?: string;
}

export interface TrainingSummary {
  totalCourses: number;
  publishedCourses: number;
  totalEnrollments: number;
  completionRate: number;
  avgScore: number;
  totalCertifications: number;
  overdueEnrollments: number;
}

export class TrainingManager {
  private courses: Map<string, TrainingCourse> = new Map();
  private enrollments: Map<string, TrainingEnrollment> = new Map();
  private certifications: Map<string, Certification> = new Map();

  constructor(private readonly bus: EventBus) {}

  createCourse(input: Omit<TrainingCourse, "id" | "createdAt"> & { id?: string }): TrainingCourse {
    const course: TrainingCourse = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.courses.set(course.id, course);
    return course;
  }

  enroll(employeeId: string, courseId: string, dueDate?: string): TrainingEnrollment | undefined {
    const course = this.courses.get(courseId);
    if (!course) return undefined;
    const enrollment: TrainingEnrollment = { id: randomUUID(), employeeId, courseId, courseName: course.name, status: "enrolled", enrolledAt: new Date().toISOString(), dueDate };
    this.enrollments.set(enrollment.id, enrollment);
    this.bus.publish("training.enrollment_created", { enrollmentId: enrollment.id, employeeId, courseId, courseName: course.name });
    return enrollment;
  }

  completeEnrollment(enrollmentId: string, score: number): TrainingEnrollment | undefined {
    const enrollment = this.enrollments.get(enrollmentId);
    if (!enrollment) return undefined;
    const course = this.courses.get(enrollment.courseId);
    const passed = course ? score >= course.passingScore : score >= 70;
    enrollment.status = passed ? "completed" : "failed";
    enrollment.score = score;
    enrollment.completedAt = new Date().toISOString();
    this.bus.publish("training.course_completed", { enrollmentId, employeeId: enrollment.employeeId, courseId: enrollment.courseId, score });
    if (passed && course) {
      const cert: Certification = { id: randomUUID(), employeeId: enrollment.employeeId, name: `${course.name} Certification`, issuedBy: "Olympus LMS", issuedAt: new Date().toISOString(), courseId: course.id };
      this.certifications.set(cert.id, cert);
      this.bus.publish("training.certification_earned", { employeeId: enrollment.employeeId, certificationId: cert.id, name: cert.name, expiresAt: cert.expiresAt });
    }
    return enrollment;
  }

  getCourse(id: string): TrainingCourse | undefined { return this.courses.get(id); }
  listCourses(status?: CourseStatus): TrainingCourse[] {
    const all = Array.from(this.courses.values());
    return status ? all.filter(c => c.status === status) : all;
  }
  listEnrollments(employeeId?: string, status?: EnrollmentStatus): TrainingEnrollment[] {
    let all = Array.from(this.enrollments.values());
    if (employeeId) all = all.filter(e => e.employeeId === employeeId);
    if (status) all = all.filter(e => e.status === status);
    return all;
  }
  listCertifications(employeeId?: string): Certification[] {
    const all = Array.from(this.certifications.values());
    return employeeId ? all.filter(c => c.employeeId === employeeId) : all;
  }

  summary(): TrainingSummary {
    const courses = Array.from(this.courses.values());
    const enrollments = Array.from(this.enrollments.values());
    const completed = enrollments.filter(e => e.status === "completed");
    const withScore = completed.filter(e => e.score !== undefined);
    const avgScore = withScore.length > 0 ? Math.round(withScore.reduce((s, e) => s + (e.score ?? 0), 0) / withScore.length) : 0;
    const now = new Date().toISOString();
    const overdue = enrollments.filter(e => e.dueDate && e.dueDate < now && e.status !== "completed").length;
    return {
      totalCourses: courses.length,
      publishedCourses: courses.filter(c => c.status === "published").length,
      totalEnrollments: enrollments.length,
      completionRate: enrollments.length > 0 ? Math.round((completed.length / enrollments.length) * 100) : 0,
      avgScore,
      totalCertifications: this.certifications.size,
      overdueEnrollments: overdue,
    };
  }
}
