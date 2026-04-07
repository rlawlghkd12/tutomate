export const PlanTypeEnum = {
  TRIAL: 'trial',
  BASIC: 'basic',
  ADMIN: 'admin',
} as const;

export type PlanType = typeof PlanTypeEnum[keyof typeof PlanTypeEnum];

export const PLAN_LIMITS = {
  trial: {
    maxCourses: 5,
    maxStudentsPerCourse: 10,
  },
  basic: {
    maxCourses: Infinity,
    maxStudentsPerCourse: Infinity,
  },
  admin: {
    maxCourses: Infinity,
    maxStudentsPerCourse: Infinity,
  },
} as const;

export type PlanLimitKey = keyof typeof PLAN_LIMITS.trial;
