import { Schema, model, options } from "./shared.js";
const schema = new Schema({
  _id: { type: String, default: "shop" },
  googleToken: { type: String, select: false },
  googleFolderId: String,
  connectedAt: Date,
  lastBackup: { filename: String, createdAt: Date, destination: String, driveFileId: String },
  lastReset: { createdAt: Date, userId: String, backupName: String, counts: Schema.Types.Mixed },
}, options);
export default model("BackupState", schema);
