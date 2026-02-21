import { useCallback, useState, type MouseEvent } from 'react';

export interface ContextMenuState<T> {
  position: { x: number; y: number };
  payload: T;
}

export const useContextMenu = <T>() => {
  const [menu, setMenu] = useState<ContextMenuState<T> | null>(null);

  const openMenu = useCallback((event: MouseEvent, payload: T) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      position: { x: event.clientX, y: event.clientY },
      payload
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  return {
    menu,
    openMenu,
    closeMenu
  };
};
