export const appConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
  encryptionMasterKey: process.env.ENCRYPTION_MASTER_KEY || 'dev-encryption-key-change-in-production',
};
