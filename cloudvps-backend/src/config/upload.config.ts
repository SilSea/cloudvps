const maxSizeMB = parseInt(process.env.MAX_ATTACHMENT_SIZE_MB ?? "5", 10);
const maxFiles = parseInt(process.env.MAX_ATTACHMENTS_PER_MESSAGE ?? "3", 10);
const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as string[];

export const UPLOAD_CONFIG = {
  slip: {
    dir: process.env.UPLOAD_DIR ? `${process.env.UPLOAD_DIR}/slips` : "uploads/slips",
    maxSizeMB,
    allowedTypes,
  },
  ticket: {
    dir: process.env.UPLOAD_DIR ? `${process.env.UPLOAD_DIR}/tickets` : "uploads/tickets",
    maxSizeMB,
    maxFiles,
    allowedTypes,
  },
};
