export const strategyFlags = {
  enableTodayQueue: import.meta.env.VITE_ENABLE_TODAY_QUEUE !== '0',
  enableLearningEvents: import.meta.env.VITE_ENABLE_LEARNING_EVENTS === '1',
  enableBehaviorEngine: import.meta.env.VITE_ENABLE_BEHAVIOR_ENGINE === '1',
};
