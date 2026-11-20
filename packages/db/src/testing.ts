/** Tipos del contexto que el global-setup de Vitest comparte con los tests de todos los paquetes. */
declare module 'vitest' {
  export interface ProvidedContext {
    ownerDatabaseUrl: string;
    appDatabaseUrl: string;
  }
}

export {};
