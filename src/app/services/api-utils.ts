export type AnyJson = any;

export function parseApiArray<T = any>(input: any): T[] {
  try {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    if (Array.isArray(data)) return data as T[];
    if (data && typeof data === 'object') {
      if (Array.isArray((data as any).Data)) return (data as any).Data as T[];
      if (Array.isArray((data as any).data)) return (data as any).data as T[];
    }
  } catch {
    // ignore
  }
  return [] as T[];
}

export function parseApiObject<T = any>(input: any): T | null {
  try {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    if (data && typeof data === 'object') {
      if ((data as any).Data && typeof (data as any).Data === 'object') return (data as any).Data as T;
      if ((data as any).data && typeof (data as any).data === 'object') return (data as any).data as T;
      return data as T;
    }
  } catch {
    // ignore
  }
  return null;
}
