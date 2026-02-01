// Tauri 파일 시스템 유틸리티 함수
import { invoke } from '@tauri-apps/api/core';
import { logInfo, logWarn, logError, logDebug } from './logger';
import { AppError, ErrorType, errorHandler } from './errors';

/**
 * 파일 시스템에서 데이터 가져오기 (동기, 캐시에서만)
 */
export const getFromStorage = <T>(key: string): T[] => {
  try {
    const cachedData = sessionStorage.getItem(key);
    const result = cachedData ? JSON.parse(cachedData) : [];
    logDebug(`Retrieved ${result.length} items from session cache for key: ${key}`);
    return result;
  } catch (error) {
    logError(`Error reading from storage key "${key}"`, { error });
    const appError = new AppError({
      type: ErrorType.FILE_READ_ERROR,
      message: `Failed to read from cache: ${key}`,
      originalError: error,
      component: 'storage',
      action: 'getFromStorage',
    });
    errorHandler.handle(appError);
    return [];
  }
};

/**
 * 파일 시스템에 데이터 저장하기
 */
export const saveToStorage = <T>(key: string, data: T[]): void => {
  try {
    // 세션 캐시에 저장
    const jsonData = JSON.stringify(data);
    sessionStorage.setItem(key, jsonData);
    logDebug(`Saved ${data.length} items to session cache for key: ${key}`);

    // Tauri 백엔드에 비동기로 저장
    invoke('save_data', {
      key,
      data: jsonData
    })
      .then(() => {
        logInfo(`Successfully persisted ${data.length} items for key: ${key}`);
      })
      .catch(error => {
        logError(`Error saving to file system key "${key}"`, { error });
        const appError = new AppError({
          type: ErrorType.FILE_WRITE_ERROR,
          message: `Failed to persist data: ${key}`,
          originalError: error,
          component: 'storage',
          action: 'saveToStorage',
        });
        errorHandler.handle(appError);
      });
  } catch (error) {
    logError(`Error in saveToStorage for key "${key}"`, { error });
    const appError = new AppError({
      type: ErrorType.FILE_WRITE_ERROR,
      message: `Failed to save data: ${key}`,
      originalError: error,
      component: 'storage',
      action: 'saveToStorage',
    });
    errorHandler.handle(appError);
  }
};

/**
 * 파일 시스템에서 데이터 로드 (비동기)
 */
export const loadData = async <T>(key: string): Promise<T[]> => {
  const timerEnd = logger.startTimer(`loadData: ${key}`);

  try {
    logInfo(`Loading data for key: ${key}`);
    const data = await invoke<string>('load_data', { key });
    const parsed = data ? JSON.parse(data) : [];

    // 세션 캐시에도 저장
    sessionStorage.setItem(key, JSON.stringify(parsed));

    logInfo(`Successfully loaded ${parsed.length} items for key: ${key}`);
    timerEnd();
    return parsed;
  } catch (error) {
    logError(`Error loading from file system key "${key}"`, { error });
    const appError = new AppError({
      type: ErrorType.FILE_READ_ERROR,
      message: `Failed to load data: ${key}`,
      originalError: error,
      component: 'storage',
      action: 'loadData',
    });
    errorHandler.handle(appError);
    timerEnd();
    return [];
  }
};

/**
 * 스토리지에서 ID로 항목 찾기
 */
export const findById = <T extends { id: string }>(
  key: string,
  id: string
): T | undefined => {
  try {
    const items = getFromStorage<T>(key);
    const found = items.find((item) => item.id === id);
    if (!found) {
      logWarn(`Item not found with id: ${id} in key: ${key}`);
    }
    return found;
  } catch (error) {
    logError(`Error finding item by id in key "${key}"`, { error, data: { id } });
    return undefined;
  }
};

/**
 * 스토리지에 항목 추가
 */
export const addToStorage = <T extends { id: string }>(
  key: string,
  item: T
): T[] => {
  try {
    const items = getFromStorage<T>(key);

    // 중복 체크
    if (items.some(existingItem => existingItem.id === item.id)) {
      const appError = new AppError({
        type: ErrorType.DUPLICATE_ERROR,
        message: `Item with id ${item.id} already exists`,
        component: 'storage',
        action: 'addToStorage',
        userMessage: '이미 존재하는 항목입니다.',
      });
      errorHandler.handle(appError);
      return items;
    }

    const newItems = [...items, item];
    saveToStorage(key, newItems);
    logInfo(`Added new item to ${key}`, { data: { id: item.id, count: newItems.length } });
    return newItems;
  } catch (error) {
    logError(`Error adding item to storage key "${key}"`, { error });
    return getFromStorage<T>(key);
  }
};

/**
 * 스토리지에서 항목 업데이트
 */
export const updateInStorage = <T extends { id: string }>(
  key: string,
  id: string,
  updatedItem: Partial<T>
): T[] => {
  try {
    const items = getFromStorage<T>(key);
    const itemExists = items.some(item => item.id === id);

    if (!itemExists) {
      logWarn(`Attempted to update non-existent item: ${id} in key: ${key}`);
      const appError = new AppError({
        type: ErrorType.INVALID_DATA,
        message: `Item with id ${id} not found`,
        component: 'storage',
        action: 'updateInStorage',
        userMessage: '수정하려는 항목을 찾을 수 없습니다.',
      });
      errorHandler.handle(appError);
      return items;
    }

    const newItems = items.map((item) =>
      item.id === id ? { ...item, ...updatedItem } : item
    );
    saveToStorage(key, newItems);
    logInfo(`Updated item in ${key}`, { data: { id } });
    return newItems;
  } catch (error) {
    logError(`Error updating item in storage key "${key}"`, { error, data: { id } });
    return getFromStorage<T>(key);
  }
};

/**
 * 스토리지에서 항목 삭제
 */
export const deleteFromStorage = <T extends { id: string }>(
  key: string,
  id: string
): T[] => {
  try {
    const items = getFromStorage<T>(key);
    const itemExists = items.some(item => item.id === id);

    if (!itemExists) {
      logWarn(`Attempted to delete non-existent item: ${id} in key: ${key}`);
    }

    const newItems = items.filter((item) => item.id !== id);
    saveToStorage(key, newItems);
    logInfo(`Deleted item from ${key}`, { data: { id, remainingCount: newItems.length } });
    return newItems;
  } catch (error) {
    logError(`Error deleting item from storage key "${key}"`, { error, data: { id } });
    return getFromStorage<T>(key);
  }
};

/**
 * 스토리지 키 초기화
 */
export const clearStorage = (key: string): void => {
  try {
    sessionStorage.removeItem(key);
    saveToStorage(key, []);
    logInfo(`Cleared storage for key: ${key}`);
  } catch (error) {
    logError(`Error clearing storage key "${key}"`, { error });
  }
};

/**
 * 모든 스토리지 초기화
 */
export const clearAllStorage = (): void => {
  try {
    sessionStorage.clear();
    Object.values(STORAGE_KEYS).forEach(key => {
      saveToStorage(key, []);
    });
    logInfo('Cleared all storage');
  } catch (error) {
    logError('Error clearing all storage', { error });
  }
};

// Storage Keys
export const STORAGE_KEYS = {
  COURSES: 'courses',
  STUDENTS: 'students',
  ENROLLMENTS: 'enrollments',
  ATTENDANCES: 'attendances',
} as const;

// logger import 추가
import { logger } from './logger';
