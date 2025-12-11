import React, { useEffect, useRef } from 'react';
import { createApp } from 'vue';
import type { Component } from 'vue';

interface VueWrapperProps {
  component: Component;
  [key: string]: any;
}

export const VueWrapper: React.FC<VueWrapperProps> = ({ component, ...props }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create Vue app instance
    const app = createApp(component, props);
    app.mount(containerRef.current);
    appRef.current = app;

    return () => {
      // Cleanup
      if (appRef.current) {
        appRef.current.unmount();
        appRef.current = null;
      }
    };
  }, [component]);

  return <div ref={containerRef} />;
};
