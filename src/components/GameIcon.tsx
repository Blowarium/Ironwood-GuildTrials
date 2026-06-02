import Image from "next/image";
import { GAME_ICON_SRC } from "@/lib/skill-icons";

export function GameIcon({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={GAME_ICON_SRC}
      alt="Ironwood RPG"
      width={size}
      height={size}
      className={`shrink-0 pixel-icon ${className}`}
      priority
    />
  );
}
