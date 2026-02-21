export type PlanType = 'trial' | 'basic';

export const PLAN_LIMITS = {
  trial: {
    maxCourses: 5,
    maxStudentsPerCourse: 10,
  },
  basic: {
    maxCourses: Infinity,
    maxStudentsPerCourse: Infinity,
  },
} as const;

export type PlanLimitKey = keyof typeof PLAN_LIMITS.trial;
