"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  friendlyAccountError,
  listDesigns,
  listFiles,
  newestFirst,
} from "@/lib/account";
import type { DesignRecord, JournalFile } from "@/lib/types";

import { useAuth } from "./AuthProvider";

interface LibraryContextValue {
  files: JournalFile[];
  designs: DesignRecord[];
  filesLoading: boolean;
  designsLoading: boolean;
  libraryLoading: boolean;
  filesStatus: string;
  designsStatus: string;
  filesFailed: boolean;
  designsFailed: boolean;
  setFiles: Dispatch<SetStateAction<JournalFile[]>>;
  setDesigns: Dispatch<SetStateAction<DesignRecord[]>>;
  getCachedFile: (id: string) => JournalFile | undefined;
  cacheFile: (file: JournalFile) => void;
  refreshLibrary: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function useLibrary(): LibraryContextValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary must be used within LibraryProvider");
  return value;
}

export default function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { user, apiStatus } = useAuth();
  const [files, setFiles] = useState<JournalFile[]>([]);
  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [designsLoading, setDesignsLoading] = useState(false);
  const [filesStatus, setFilesStatus] = useState("");
  const [designsStatus, setDesignsStatus] = useState("");
  const [filesFailed, setFilesFailed] = useState(false);
  const [designsFailed, setDesignsFailed] = useState(false);

  const fileCacheRef = useRef<Map<string, JournalFile>>(new Map());
  const prefetchTokenRef = useRef(0);

  const getCachedFile = useCallback(
    (id: string) => files.find((file) => file.id === id) ?? fileCacheRef.current.get(id),
    [files],
  );

  const cacheFile = useCallback((file: JournalFile) => {
    fileCacheRef.current.set(file.id, file);
  }, []);

  const loadLibrary = useCallback(async (token: number) => {
    setFilesLoading(true);
    setDesignsLoading(true);
    setFilesStatus("");
    setDesignsStatus("");
    setFilesFailed(false);
    setDesignsFailed(false);

    const [filesResult, designsResult] = await Promise.allSettled([listFiles(), listDesigns()]);

    if (token !== prefetchTokenRef.current) return;

    if (filesResult.status === "fulfilled") {
      const rows = newestFirst(filesResult.value);
      setFiles(rows);
      for (const file of rows) fileCacheRef.current.set(file.id, file);
    } else {
      setFiles([]);
      setFilesFailed(true);
      setFilesStatus(friendlyAccountError(filesResult.reason, "files"));
    }
    setFilesLoading(false);

    if (designsResult.status === "fulfilled") {
      setDesigns(newestFirst(designsResult.value));
    } else {
      setDesigns([]);
      setDesignsFailed(true);
      setDesignsStatus(friendlyAccountError(designsResult.reason, "designs"));
    }
    setDesignsLoading(false);
  }, []);

  const refreshLibrary = useCallback(async () => {
    if (!user || apiStatus !== "ok") return;
    const token = prefetchTokenRef.current + 1;
    prefetchTokenRef.current = token;
    await loadLibrary(token);
  }, [user, apiStatus, loadLibrary]);

  useEffect(() => {
    if (!user || apiStatus !== "ok") {
      prefetchTokenRef.current += 1;
      fileCacheRef.current.clear();
      setFiles([]);
      setDesigns([]);
      setFilesLoading(false);
      setDesignsLoading(false);
      setFilesStatus("");
      setDesignsStatus("");
      setFilesFailed(false);
      setDesignsFailed(false);
      return;
    }

    const token = prefetchTokenRef.current + 1;
    prefetchTokenRef.current = token;
    void loadLibrary(token);
  }, [user, apiStatus, loadLibrary]);

  const value = useMemo(
    () => ({
      files,
      designs,
      filesLoading,
      designsLoading,
      libraryLoading: filesLoading || designsLoading,
      filesStatus,
      designsStatus,
      filesFailed,
      designsFailed,
      setFiles,
      setDesigns,
      getCachedFile,
      cacheFile,
      refreshLibrary,
    }),
    [
      files,
      designs,
      filesLoading,
      designsLoading,
      filesStatus,
      designsStatus,
      filesFailed,
      designsFailed,
      getCachedFile,
      cacheFile,
      refreshLibrary,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
