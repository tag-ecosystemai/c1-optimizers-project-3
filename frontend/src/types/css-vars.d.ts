import "react";

// Allow CSS custom properties in style props, e.g. style={{ "--idx": "3" }}.
declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
