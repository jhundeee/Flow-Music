import { useState, useLayoutEffect, useRef, useCallback, useEffect } from 'react';

export function useWindowedList(items = [], itemHeight = 48, bufferItems = 5) {
  const [visibleStart, setVisibleStart] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const containerRef = useRef(null);
  const rafRef = useRef(null);

  const itemsRef = useRef(items);

  useEffect(() => {
    if (itemsRef.current !== items) {
      itemsRef.current = items;
      setVisibleStart(0);
      if (containerRef.current) containerRef.current.scrollTop = 0;
    }
  }, [items]);

  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = containerRef.current;
      if (!el) return;
      const newStart = Math.max(0, Math.floor(el.scrollTop / itemHeight) - bufferItems);
      setVisibleStart(newStart);
    });
  }, [itemHeight, bufferItems]);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const h = el.clientHeight || el.parentElement?.clientHeight || el.getBoundingClientRect().height || 0;
    if (h > 0) setContainerHeight(h);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measure]);

  useEffect(() => {
    if (containerHeight > 0) return;
    const id = setTimeout(measure, 50);
    return () => clearTimeout(id);
  }, [containerHeight, measure]);

  const ch = containerHeight || (typeof window !== 'undefined' ? window.innerHeight - 150 : 400);
  const visibleCount = Math.min(items.length, Math.max(10, Math.ceil(ch / itemHeight) + bufferItems * 2));
  const visibleEnd = Math.min(items.length, visibleStart + visibleCount);
  const visibleItems = items.slice(visibleStart, visibleEnd);
  const offsetY = visibleStart * itemHeight;

  return {
    containerRef,
    visibleItems,
    visibleStart,
    visibleEnd,
    offsetY,
    totalHeight: items.length * itemHeight,
    onScroll: handleScroll,
  };
}
