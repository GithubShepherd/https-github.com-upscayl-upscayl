"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ELECTRON_COMMANDS from "../../common/commands";
import { useAtom, useAtomValue } from "jotai";
import { logAtom } from "../atoms/logAtom";
import { modelsListAtom } from "../atoms/modelsListAtom";
import {
  batchModeAtom,
  lensSizeAtom,
  compressionAtom,
  dontShowCloudModalAtom,
  noImageProcessingAtom,
  savedOutputPathAtom,
  overwriteAtom,
  progressAtom,
  scaleAtom,
  viewTypeAtom,
  rememberOutputFolderAtom,
  customWidthAtom,
  useCustomWidthAtom,
  tileSizeAtom,
} from "../atoms/userSettingsAtom";
import useLog from "../components/hooks/useLog";
import {
  BatchUpscaylPayload,
  DoubleUpscaylPayload,
  ImageUpscaylPayload,
} from "@common/types/types";
import { newsAtom, showNewsModalAtom } from "@/atoms/newsAtom";
import matter from "gray-matter";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import Logo from "@/components/icons/Logo";
import { sanitizePath } from "@common/sanitize-path";
import { translationAtom } from "@/atoms/translations-atom";
import Sidebar from "@/components/sidebar";
import MainContent from "@/components/main-content";
import getDirectoryFromPath from "@common/get-directory-from-path";
import { FEATURE_FLAGS } from "@common/feature-flags";
import { VALID_IMAGE_FORMATS } from "@/lib/valid-formats";

const Home = () => {
  const t = useAtomValue(translationAtom);
  const { logit } = useLog();
  const { toast } = useToast();

  // * SHARED HOOKS AND STATES
  const [imagePath, setImagePath] = useState("");
  const rememberOutputFolder = useAtomValue(rememberOutputFolderAtom);
  const [outputPath, setOutputPath] = useAtom(savedOutputPathAtom);
  const [dimensions, setDimensions] = useState({
    width: null,
    height: null,
  });
  const [progress, setProgress] = useAtom(progressAtom);
  const [upscaledImagePath, setUpscaledImagePath] = useState("");
  const [batchFolderPath, setBatchFolderPath] = useState("");
  const [upscaledBatchFolderPath, setUpscaledBatchFolderPath] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [doubleUpscaylCounter, setDoubleUpscaylCounter] = useState(0);
  const [modelOptions, setModelOptions] = useAtom(modelsListAtom);
  const [news, setNews] = useAtom(newsAtom);
  const [showNewsModal, setShowNewsModal] = useAtom(showNewsModalAtom);
  const [batchMode, setBatchMode] = useAtom(batchModeAtom);

  // * SHARED FUNCTIONS
  const selectImageHandler = async () => {
    resetImagePaths();
    var path = await window.electron.invoke(ELECTRON_COMMANDS.SELECT_FILE);
    if (path === null) return;
    logit("🖼 Selected Image Path: ", path);
    setImagePath(path);
    var dirname = getDirectoryFromPath(path);
    logit("📁 Selected Image Directory: ", dirname);
    if (!FEATURE_FLAGS.APP_STORE_BUILD) {
      if (!rememberOutputFolder) {
        setOutputPath(dirname);
      }
    }
    validateImagePath(path);
  };
  const validateImagePath = (path: string) => {
    if (path.length > 0) {
      logit("🖼 imagePath: ", path);
      const extension = path.toLocaleLowerCase().split(".").pop();
      logit("🔤 Extension: ", extension);
      if (!VALID_IMAGE_FORMATS.includes(extension.toLowerCase())) {
        toast({
          title: t("ERRORS.INVALID_IMAGE_ERROR.TITLE"),
          description: t("ERRORS.INVALID_IMAGE_ERROR.DESCRIPTION"),
        });
        resetImagePaths();
      }
    } else {
      resetImagePaths();
    }
  };
  const selectFolderHandler = async () => {
    resetImagePaths();
    var path = await window.electron.invoke(ELECTRON_COMMANDS.SELECT_FOLDER);
    if (path !== null) {
      logit("🖼 Selected Folder Path: ", path);
      setBatchFolderPath(path);
      if (!rememberOutputFolder) {
        setOutputPath(path);
      }
    } else {
      logit("🚫 Folder selection cancelled");
      setBatchFolderPath("");
      if (!rememberOutputFolder) {
        setOutputPath("");
      }
    }
  };

  // ELECTRON EVENT LISTENERS
  useEffect(() => {
    const handleErrors = (data: string) => {
      if (data.includes("Invalid GPU")) {
        toast({
          title: t("ERRORS.GPU_ERROR.TITLE"),
          description: t("ERRORS.GPU_ERROR.DESCRIPTION", { data }),
          action: (
            <div className="flex flex-col gap-2">
              <ToastAction
                altText={t("ERRORS.COPY_ERROR.TITLE")}
                onClick={() => {
                  navigator.clipboard.writeText(data);
                }}
              >
                {t("ERRORS.COPY_ERROR.TITLE")}
              </ToastAction>
              <a href="https://docs.upscayl.org/" target="_blank">
                <ToastAction altText={t("ERRORS.OPEN_DOCS_TITLE")}>
                  {t("ERRORS.OPEN_DOCS_BUTTON_TITLE")}
                </ToastAction>
              </a>
            </div>
          ),
        });
        resetImagePaths();
      } else if (data.includes("write") || data.includes("read")) {
        if (batchMode) return;
        toast({
          title: t("ERRORS.READ_WRITE_ERROR.TITLE"),
          description: t("ERRORS.READ_WRITE_ERROR.DESCRIPTION", { data }),
          action: (
            <div className="flex flex-col gap-2">
              <ToastAction
                altText="Copy Error"
                onClick={() => {
                  navigator.clipboard.writeText(data);
                }}
              >
                {t("ERRORS.COPY_ERROR.TITLE")}
              </ToastAction>
              <a href="https://docs.upscayl.org/" target="_blank">
                <ToastAction altText={t("ERRORS.OPEN_DOCS_TITLE")}>
                  {t("ERRORS.OPEN_DOCS_BUTTON_TITLE")}
                </ToastAction>
              </a>
            </div>
          ),
        });
        resetImagePaths();
      } else if (data.includes("tile size")) {
        toast({
          title: t("ERRORS.TILE_SIZE_ERROR.TITLE"),
          description: t("ERRORS.TILE_SIZE_ERROR.DESCRIPTION", { data }),
        });
        resetImagePaths();
      } else if (data.includes("uncaughtException")) {
        toast({
          title: t("ERRORS.EXCEPTION_ERROR.TITLE"),
          description: t("ERRORS.EXCEPTION_ERROR.DESCRIPTION"),
        });
        resetImagePaths();
      }
    };
    // LOG
    window.electron.on(ELECTRON_COMMANDS.LOG, (_, data: string) => {
      logit(`🎒 BACKEND REPORTED: `, data);
    });
    // SCALING AND CONVERTING
    window.electron.on(
      ELECTRON_COMMANDS.SCALING_AND_CONVERTING,
      (_, data: string) => {
        setProgress(t("APP.PROGRESS.PROCESSING_TITLE"));
      },
    );
    // UPSCAYL ERROR
    window.electron.on(ELECTRON_COMMANDS.UPSCAYL_ERROR, (_, data: string) => {
      toast({
        title: t("ERRORS.GENERIC_ERROR.TITLE"),
        description: data,
      });
      resetImagePaths();
    });
    // UPSCAYL PROGRESS
    window.electron.on(
      ELECTRON_COMMANDS.UPSCAYL_PROGRESS,
      (_, data: string) => {
        if (data.length > 0 && data.length < 10) {
          setProgress(data);
        } else if (data.includes("converting")) {
          setProgress(t("APP.PROGRESS.SCALING_CONVERTING_TITLE"));
        } else if (data.includes("Successful")) {
          setProgress(t("APP.PROGRESS.SUCCESS_TITLE"));
        }
        handleErrors(data);
        logit(`🚧 UPSCAYL_PROGRESS: `, data);
      },
    );
    // FOLDER UPSCAYL PROGRESS
    window.electron.on(
      ELECTRON_COMMANDS.FOLDER_UPSCAYL_PROGRESS,
      (_, data: string) => {
        if (data.includes("Successful")) {
          setProgress(t("APP.PROGRESS.SUCCESS_TITLE"));
        }
        if (data.length > 0 && data.length < 10) {
          setProgress(data);
        }
        handleErrors(data);
        logit(`🚧 FOLDER_UPSCAYL_PROGRESS: `, data);
      },
    );
    // DOUBLE UPSCAYL PROGRESS
    window.electron.on(
      ELECTRON_COMMANDS.DOUBLE_UPSCAYL_PROGRESS,
      (_, data: string) => {
        if (data.length > 0 && data.length < 10) {
          if (data === "0.00%") {
            setDoubleUpscaylCounter(doubleUpscaylCounter + 1);
          }
          setProgress(data);
        }
        handleErrors(data);
        logit(`🚧 DOUBLE_UPSCAYL_PROGRESS: `, data);
      },
    );
    // UPSCAYL DONE
    window.electron.on(ELECTRON_COMMANDS.UPSCAYL_DONE, (_, data: string) => {
      setProgress("");
      setUpscaledImagePath(data);
      logit("upscaledImagePath: ", data);
      logit(`💯 UPSCAYL_DONE: `, data);
    });
    // FOLDER UPSCAYL DONE
    window.electron.on(
      ELECTRON_COMMANDS.FOLDER_UPSCAYL_DONE,
      (_, data: string) => {
        setProgress("");
        setUpscaledBatchFolderPath(data);
        logit(`💯 FOLDER_UPSCAYL_DONE: `, data);
      },
    );
    // DOUBLE UPSCAYL DONE
    window.electron.on(
      ELECTRON_COMMANDS.DOUBLE_UPSCAYL_DONE,
      (_, data: string) => {
        setProgress("");
        setTimeout(() => setUpscaledImagePath(data), 500);
        setDoubleUpscaylCounter(0);
        logit(`💯 DOUBLE_UPSCAYL_DONE: `, data);
      },
    );
    // CUSTOM FOLDER LISTENER
    window.electron.on(
      ELECTRON_COMMANDS.CUSTOM_MODEL_FILES_LIST,
      (_, data: string[]) => {
        logit(`📜 CUSTOM_MODEL_FILES_LIST: `, data);
        const newModelOptions = data.map((model) => {
          return {
            value: model,
            label: model,
          };
        });
        // Add newModelsList to modelOptions and remove duplicates
        const combinedModelOptions = [...modelOptions, ...newModelOptions];
        const uniqueModelOptions = combinedModelOptions.filter(
          // Check if any model in the array appears more than once
          (model, index, array) =>
            array.findIndex((t) => t.value === model.value) === index,
        );
        setModelOptions(uniqueModelOptions);
      },
    );
  }, []);

  // FETCH CUSTOM MODELS FROM CUSTOM MODELS PATH
  useEffect(() => {
    const customModelsPath = JSON.parse(
      localStorage.getItem("customModelsPath"),
    );
    if (customModelsPath !== null) {
      window.electron.send(ELECTRON_COMMANDS.GET_MODELS_LIST, customModelsPath);
      logit("🎯 GET_MODELS_LIST: ", customModelsPath);
    }
  }, []);

  // FETCH NEWS
  useEffect(() => {
    // TODO: ADD AN ABOUT TAB
    if (window && window.navigator.onLine === false) return;
    try {
      fetch("https://raw.githubusercontent.com/upscayl/upscayl/main/news.md", {
        cache: "no-cache",
      })
        .then((res) => {
          return res.text();
        })
        .then((result) => {
          const newsData = result;
          if (!newsData) {
            console.log("📰 Could not fetch news data");
            return;
          }
          const markdownData = matter(newsData);
          if (!markdownData) return;
          if (markdownData && markdownData.data.dontShow) {
            return;
          }
          if (
            markdownData &&
            news &&
            markdownData?.data?.version === news?.data?.version
          ) {
            console.log("📰 News is up to date");
            if (showNewsModal === false) {
              setShowNewsModal(false);
            }
          } else if (markdownData) {
            setNews(matter(newsData));
            setShowNewsModal(true);
          }
        });
    } catch (error) {
      console.log("Could not fetch Upscayl News");
    }
  }, [news]);

  // LOADING STATE
  useEffect(() => {
    setIsLoading(false);
  }, []);

  // HANDLERS
  const resetImagePaths = () => {
    logit("🔄 Resetting image paths");
    setDimensions({
      width: null,
      height: null,
    });
    setProgress("");
    setImagePath("");
    setUpscaledImagePath("");
    setBatchFolderPath("");
    setUpscaledBatchFolderPath("");
  };

  // UTILS

  // HANDLERS

  if (isLoading) {
    return (
      <Logo className="absolute left-1/2 top-1/2 w-36 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
    );
  }

  return (
    <div className="flex h-screen w-screen flex-row overflow-hidden bg-base-300">
      <Sidebar
        imagePath={imagePath}
        dimensions={dimensions}
        upscaledImagePath={upscaledImagePath}
        setUpscaledImagePath={setUpscaledImagePath}
        batchFolderPath={batchFolderPath}
        setUpscaledBatchFolderPath={setUpscaledBatchFolderPath}
        selectImageHandler={selectImageHandler}
        selectFolderHandler={selectFolderHandler}
      />
      <MainContent
        imagePath={imagePath}
        resetImagePaths={resetImagePaths}
        upscaledBatchFolderPath={upscaledBatchFolderPath}
        setImagePath={setImagePath}
        validateImagePath={validateImagePath}
        selectFolderHandler={selectFolderHandler}
        selectImageHandler={selectImageHandler}
        batchFolderPath={batchFolderPath}
        upscaledImagePath={upscaledImagePath}
        doubleUpscaylCounter={doubleUpscaylCounter}
        setDimensions={setDimensions}
      />
    </div>
  );
};

export default Home;
