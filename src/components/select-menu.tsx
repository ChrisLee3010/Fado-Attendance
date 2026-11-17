"use client";

import { useEffect, useId, useRef, useState } from "react";

export type MenuOption = { value: string; label: string };

type Props = {
  label: string;
  value: string | null;
  options: MenuOption[];
  fallbackLabel?: string;
  icon?: React.ReactNode;
  onChange: (value: string) => void;
};

export function SelectMenu({ label, value, options, fallbackLabel = "", icon, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

  function openMenu() {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(index: number) {
    onChange(options[index].value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (open) setActive((index) => Math.min(options.length - 1, index + 1));
        else openMenu();
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) setActive((index) => Math.max(0, index - 1));
        else openMenu();
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActive(options.length - 1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(active);
        else openMenu();
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div className="menu" ref={rootRef}>
      <div
        className={`menu-trigger ${open ? "open" : ""}`}
        role="combobox"
        tabIndex={0}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        {icon}
        <span className="menu-value">{options[selectedIndex]?.label ?? fallbackLabel}</span>
        <svg className="menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {open && (
        <ul className="menu-list" role="listbox" id={listId} aria-label={label} onMouseDown={(event) => event.preventDefault()}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={`menu-option ${index === active ? "active" : ""} ${index === selectedIndex ? "selected" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {index === selectedIndex && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="m5 12 4.2 4.2L19 6.7" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
