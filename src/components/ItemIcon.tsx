"use client";

import Image from "next/image";
import { getMaterialIconSrc, ITEM_ICON_SRC } from "@/lib/item-icons";

const SIZES = {
  xs: 16,
  sm: 20,
  md: 24,
} as const;

export function ItemIcon({
  itemId,
  size = "xs",
  className = "",
  title,
}: {
  itemId: string;
  size?: keyof typeof SIZES;
  className?: string;
  title?: string;
}) {
  const src = ITEM_ICON_SRC[itemId] ?? getMaterialIconSrc(itemId);
  if (!src) return null;

  const px = SIZES[size];
  return (
    <Image
      src={src}
      alt=""
      width={px}
      height={px}
      className={`shrink-0 pixel-icon ${className}`}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  );
}
