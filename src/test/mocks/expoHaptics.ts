export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}
export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}
export const impactAsync = jest.fn(async () => {});
export const notificationAsync = jest.fn(async () => {});
export const selectionAsync = jest.fn(async () => {});
