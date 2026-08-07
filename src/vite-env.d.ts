/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_URL: string;
  /** Client-side sign-in gate / role map — display only, see src/auth/roles.ts. */
  readonly VITE_API_KEYS: string;
  /** The one key the backend actually accepts; sent with every request. */
  readonly VITE_ADMIN_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

