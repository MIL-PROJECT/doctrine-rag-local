"use client";

import { createGlobalStyle } from "styled-components";

export const GlobalStyles = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    height: 100%;
    min-height: 100%;
    overflow: hidden;
  }

  body {
    font-family:
      system-ui,
      -apple-system,
      "Segoe UI",
      Roboto,
      "Apple SD Gothic Neo",
      "Malgun Gothic",
      "Noto Sans KR",
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  ::selection {
    background: color-mix(in srgb, #2563eb 28%, transparent);
    color: inherit;
  }

  button,
  a {
    cursor: pointer;
  }

  a:focus-visible,
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid color-mix(in srgb, #2563eb 55%, #93c5fd);
    outline-offset: 2px;
  }
`;
