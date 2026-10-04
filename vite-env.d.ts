/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  readonly VITE_WEB_PUSH_SUBSCRIBE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
