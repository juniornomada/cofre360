import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface IconProps {
  icon: LucideIcon;
  size?: number;
  color?: string;
  className?: string;
  "data-testid"?: string;
  "data-size"?: number;
}

export const Icon = ({ 
  icon: LucideIconComponent, 
  size = 24, 
  color, 
  className,
  "data-testid": testId = "icon",
  "data-size": dataSize
}: IconProps) => {
  return (
    <LucideIconComponent
      size={size}
      color={color}
      data-testid={testId}
      data-size={dataSize || size}
      className={cn("transition-all duration-200", className)}
    />
  );
};
