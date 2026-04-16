import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';

export type MockPrismaClient = DeepMockProxy<PrismaClient>;

export const createMockPrisma = () => mockDeep<PrismaClient>();

export const mockRedisLockService = {
  withLock: jest.fn((key, fn) => fn()),
};

export const mockRedisCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  getOrSet: jest.fn((key, factory) => factory()),
  delPattern: jest.fn(),
};

export const mockConfigService = {
  get: jest.fn((key, defaultValue) => defaultValue),
};

export const mockPaymentService = {
  createPaymentIntent: jest.fn(),
  cancelPaymentIntent: jest.fn(),
};

export const mockUserService = {
  checkKycEligibility: jest.fn(),
  findById: jest.fn(),
};

export const mockSeatService = {
  lockSeatForReservation: jest.fn(),
  updateSeatStatus: jest.fn(),
};
