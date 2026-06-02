import Image from "next/image";
import type { Skill } from "@/lib/constants";
import { SKILL_ICON_SRC } from "@/lib/skill-icons";

const SIZES = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
} as const;

export function SkillIcon({
  skill,
  size = "md",
  className = "",
}: {
  skill: Skill;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <Image
      src={SKILL_ICON_SRC[skill]}
      alt=""
      width={px}
      height={px}
      className={`shrink-0 pixel-icon ${className}`}
      aria-hidden
    />
  );
}
