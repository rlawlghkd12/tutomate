declare const __APP_CONFIG__: {
  appName: string;
  windowTitle: string;
  defaultOrgName: string;
  deviceIdKey: string;
  licenseFormatHint: string;
  contactInfo: string;
  welcomeTitle: string;
  scheme?: string;
  enableMemberFeature?: boolean;
  hideAddressField?: boolean;
  enableQuarterSystem?: boolean;
};

export const appConfig = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : {
  appName: 'TutorMate',
  windowTitle: '수강생 관리 프로그램',
  defaultOrgName: '수강생 관리 프로그램',
  deviceIdKey: 'tutomate_device_id',
  licenseFormatHint: 'TMKH-XXXX-XXXX-XXXX',
  contactInfo: 'support@taktonlabs.com',
  welcomeTitle: 'TutorMate에 오신 것을 환영합니다!',
  scheme: 'tutomate',
  enableMemberFeature: false,
  hideAddressField: false,
  enableQuarterSystem: false,
};
