"use client";
import { useEffect } from "react";
export function Theme() {
  useEffect(() => {
    const match = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const override = new URLSearchParams(window.location.search).get("theme");
      document.documentElement.dataset.theme =
        override === "light" || override === "night"
          ? override
          : match.matches
            ? "night"
            : "light";
    };
    apply();
    match.addEventListener("change", apply);
    return () => match.removeEventListener("change", apply);
  }, []);
  return null;
}
