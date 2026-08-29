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
  filesLoaded: boolean;
  designsLoaded: boolean;
  setFiles: Dispatch<SetStateAction<JournalFile[]>>;
  setDesigns: Dispatch<SetStateAction<DesignRecord[]>>;
  getCachedFile: (id: string) => JournalFile | undefined;
  cacheFile: (file: JournalFile) => void;
  ensureFilesLoaded: () => void;
  ensureDesignsLoaded: () => void;
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
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [designsLoaded, setDesignsLoaded] = useState(false);

  const fileCacheRef = useRef<Map<string, JournalFile>>(new Map());
  const filesTokenRef = useRef(0);
  const designsTokenRef = useRef(0);

  const getCachedFile = useCallback(
    (id: string) => files.find((file) => file.id === id) ?? fileCacheRef.current.get(id),
    [files],
  );

  const cacheFile = useCallback((file: JournalFile) => {
    fileCacheRef.current.set(file.id, file);
  }, []);

  const loadFiles = useCallback(async (token: number) => {
    setFilesLoading(true);
    setFilesStatus("");
    setFilesFailed(false);

    try {
      const rows = newestFirst(await listFiles());
      if (token !== filesTokenRef.current) return;
      setFiles(rows);
      for (const file of rows) fileCacheRef.current.set(file.id, file);
      setFilesLoaded(true);
    } catch (error) {
      if (token !== filesTokenRef.current) return;
      setFiles([]);
      setFilesFailed(true);
      setFilesStatus(friendlyAccountError(error, "files"));
    } finally {
      if (token === filesTokenRef.current) setFilesLoading(false);
    }
  }, []);

  const loadDesigns = useCallback(async (token: number) => {
    setDesignsLoading(true);
    setDesignsStatus("");
    setDesignsFailed(false);

    try {
      const rows = newestFirst(await listDesigns());
      if (token !== designsTokenRef.current) return;
      setDesigns(rows);
      setDesignsLoaded(true);
    } catch (error) {
      if (token !== designsTokenRef.current) return;
      setDesigns([]);
      setDesignsFailed(true);
      setDesignsStatus(friendlyAccountError(error, "designs"));
    } finally {
      if (token === designsTokenRef.current) setDesignsLoading(false);
    }
  }, []);

  const ensureFilesLoaded = useCallback(() => {
    if (!user || apiStatus !== "ok" || filesLoading || filesLoaded) return;
    const token = filesTokenRef.current + 1;
    filesTokenRef.current = token;
    void loadFiles(token);
  }, [user, apiStatus, filesLoading, filesLoaded, loadFiles]);

  const ensureDesignsLoaded = useCallback(() => {
    if (!user || apiStatus !== "ok" || designsLoading || designsLoaded) return;
    const token = designsTokenRef.current + 1;
    designsTokenRef.current = token;
    void loadDesigns(token);
  }, [user, apiStatus, designsLoading, designsLoaded, loadDesigns]);

  const refreshLibrary = useCallback(async () => {
    if (!user || apiStatus !== "ok") return;
    const filesToken = filesTokenRef.current + 1;
    const designsToken = designsTokenRef.current + 1;
    filesTokenRef.current = filesToken;
    designsTokenRef.current = designsToken;
    await Promise.all([loadFiles(filesToken), loadDesigns(designsToken)]);
  }, [user, apiStatus, loadFiles, loadDesigns]);

  useEffect(() => {
    if (!user || apiStatus !== "ok") {
      filesTokenRef.current += 1;
      designsTokenRef.current += 1;
      fileCacheRef.current.clear();
      setFiles([]);
      setDesigns([]);
      setFilesLoading(false);
      setDesignsLoading(false);
      setFilesStatus("");
      setDesignsStatus("");
      setFilesFailed(false);
      setDesignsFailed(false);
      setFilesLoaded(false);
      setDesignsLoaded(false);
    }
  }, [user, apiStatus]);

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
      filesLoaded,
      designsLoaded,
      setFiles,
      setDesigns,
      getCachedFile,
      cacheFile,
      ensureFilesLoaded,
      ensureDesignsLoaded,
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
      filesLoaded,
      designsLoaded,
      getCachedFile,
      cacheFile,
      ensureFilesLoaded,
      ensureDesignsLoaded,
      refreshLibrary,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
