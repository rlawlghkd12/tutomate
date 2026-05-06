// 비교할 모델 카탈로그
export interface LabModel {
  id: string;
  label: string;
  filename: string;
  url: string;
  sizeBytes: number;
  contextSize: number;
}

export const CATALOG: LabModel[] = [
  {
    id: 'qwen-2.5-3b-q4',
    label: 'Qwen 2.5 3B Instruct (Q4_K_M)',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    sizeBytes: 2_104_932_768,
    contextSize: 4096,
  },
  {
    id: 'qwen-3.5-4b-q4',
    label: 'Qwen 3.5 4B (Q4_K_M)',
    filename: 'qwen3.5-4b-q4_k_m.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
    sizeBytes: 2_740_937_888,
    contextSize: 8192,
  },
  {
    id: 'gemma-4-e2b-q4',
    label: 'Gemma 4 E2B (Q4_K_M, 모바일/엣지용)',
    filename: 'gemma-4-E2B-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf',
    sizeBytes: 3_106_736_256,
    contextSize: 8192,
  },
  {
    id: 'gemma-4-e4b-q4',
    label: 'Gemma 4 E4B (Q4_K_M, 네이티브 함수 호출)',
    filename: 'gemma-4-E4B-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf',
    sizeBytes: 4_977_169_568,
    contextSize: 8192,
  },
  {
    id: 'exaone-3.5-2.4b-q4',
    label: 'EXAONE 3.5 2.4B Instruct (Q4_K_M, 한국어 특화)',
    filename: 'EXAONE-3.5-2.4B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/LGAI-EXAONE/EXAONE-3.5-2.4B-Instruct-GGUF/resolve/main/EXAONE-3.5-2.4B-Instruct-Q4_K_M.gguf',
    sizeBytes: 1_644_918_272,
    contextSize: 4096,
  },
];

export function findModel(id: string): LabModel | undefined {
  return CATALOG.find((m) => m.id === id);
}
