import React from 'react';
import { GraduationCap } from 'lucide-react';
import { cn } from '../utils/cn';

interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className, size = 32 }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 bg-theme-primary/20 blur-lg rounded-full animate-pulse" />
        <div className="relative bg-theme-primary p-2 rounded-xl shadow-lg shadow-theme-primary/20">
          <GraduationCap size={size} className="text-white" />
        </div>
      </div>
      <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-theme-primary to-theme-primary/70 tracking-tight">
        學生記事本
      </span>
    </div>
  );
}
