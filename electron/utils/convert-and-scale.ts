import fs from "fs";
import sharp, { FormatEnum, Metadata } from "sharp";
import logit from "./logit";
import { compression, customWidth } from "./config-variables";
import { ImageFormat } from "./types";

const convertAndScale = async (
  originalImagePath: string,
  upscaledImagePath: string,
  processedImagePath: string,
  scale: string,
  saveImageAs: ImageFormat,
  imageIsAlpha?: boolean,
) => {
  // Skip conversion when the scale is 4x and compression is 0
  // - When output format is WebP or PNG
  // - When the image is not alpha and the output format is JPEG
  if (
    !customWidth &&
    (saveImageAs === "png" || saveImageAs === "webp") &&
    scale === "4" &&
    compression === 0
  ) {
    logit("Skipping compression for 4x scale and 0% compression");
    return;
  } else if (
    !customWidth &&
    saveImageAs === "jpg" &&
    scale === "4" &&
    compression === 0 &&
    !imageIsAlpha
  ) {
    logit("Skipping compression for 4x scale and 0% compression");
    return;
  }

  let originalImage: Metadata | undefined;

  try {
    originalImage = await sharp(originalImagePath).metadata();
  } catch (error) {
    logit("❌ Error with original Image: ", error, " - ", originalImagePath);
  }

  fs.access(originalImagePath, fs.constants.F_OK, (err) => {
    logit("🖼️ Checking if original image exists: ", originalImagePath);
    if (err) {
      throw new Error(
        "Could not grab the original image from the path provided! - " + err,
      );
    }
  });

  if (!originalImage) {
    throw new Error("Could not grab the original image!");
  }

  // Convert compression percentage (0-100) to compressionLevel (0-9)
  const compressionLevel = Math.round((compression / 100) * 9);

  logit(
    "📐 Processing Image: ",
    JSON.stringify({
      originalWidth: originalImage.width,
      originalHeight: originalImage.height,
      customWidth,
      scale,
      saveImageAs,
      compressionPercentage: compression,
      compressionLevel,
    }),
  );

  // Resize the image to the scale
  const newImage = sharp(upscaledImagePath, {
    limitInputPixels: false,
  })
    .resize(
      customWidth
        ? parseInt(customWidth)
        : originalImage.width && originalImage.width * parseInt(scale),
      customWidth
        ? null
        : originalImage.height && originalImage.height * parseInt(scale),
    )
    .withMetadata({
      density: originalImage.density,
      orientation: originalImage.orientation,
    });

  const buffer = await newImage
    .withMetadata({
      density: originalImage.density,
      orientation: originalImage.orientation,
    })
    .toBuffer();

  try {
    await sharp(buffer, {
      limitInputPixels: false,
    })
      .withMetadata({
        density: originalImage.density,
        orientation: originalImage.orientation,
      })
      .toFormat(saveImageAs as keyof FormatEnum, {
        ...(saveImageAs === "jpg" && {
          quality: 100 - (compression === 100 ? 99 : compression),
          chromaSubsampling: "4:4:4",
        }),
        // For PNGs, compression enables indexed colors automatically,
        // so we need to warn the user that this will happen
        // https://sharp.pixelplumbing.com/api-output#png
        ...(saveImageAs === "png" &&
          compression > 0 && {
            ...(compression > 0 && {
              quality: 100 - (compression === 100 ? 99 : compression),
            }),
            compressionLevel: 9,
          }),
        ...(saveImageAs === "webp" && {
          quality: 100 - (compression === 100 ? 99 : compression),
          alphaQuality: 100,
          lossless: compression === 0,
          smartSubsample: true,
        }),
        force: true,
      })
      .toFile(processedImagePath);
  } catch (error) {
    logit("❌ Error converting to: ", saveImageAs, error);
  }

  logit("✅ Done converting to: ", upscaledImagePath);
};

export default convertAndScale;
