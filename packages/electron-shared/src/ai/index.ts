export {
  decideRecommendation,
  decideContextSize,
  diagnose,
  type Recommendation,
  type Tier,
  type DiagnosticInput,
  type DiagnosticResult,
} from './HardwareDiagnostic';
export { createFileStash, type FileStash, type FileStashOptions } from './FileStash';
export {
  ModelManager,
  QWEN_3_5_4B_Q4,
  QWEN_2_5_3B_Q4, // deprecated alias
  type ModelSpec,
  type ModelEvent,
} from './ModelManager';
export type { LlamaRuntime, LlamaRuntimeOptions } from './LlamaRuntime';
export { createLlamaServerRuntime } from './LlamaServerRuntime';
export {
  findLlamaServerBin,
  detectPlatformDir,
  llamaBinDownloadUrl,
  LLAMA_BIN_RELEASE,
} from './llamaServerBin';
export { EngineManager, type EngineEvent } from './EngineManager';
export {
  ensureVcRedist,
  isVcRedistInstalled,
  type VcRedistEvent,
} from './VcRedistInstaller';
