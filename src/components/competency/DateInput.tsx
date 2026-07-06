"use client";

import { useRef } from "react";

type DateInputProps = {
    id: string;
    name: string;
    defaultValue?: string;
    required?: boolean;
    className?: string;
};

export default function DateInput({
    id,
    name,
    defaultValue,
    required = false,
    className = "",
}: DateInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    function openDatePicker() {
        const input = inputRef.current;

        if (!input) return;

        try {
            if (typeof input.showPicker === "function") {
                input.showPicker();
            }
        } catch {
        // บาง browser จะไม่ยอมเปิด showPicker ในบางจังหวะ
        // ปล่อยให้ input type=date ทำงานแบบปกติแทน
        }
    }

return (
    <input
        ref={inputRef}
        id={id}
        name={name}
        type="date"
        required={required}
        defaultValue={defaultValue}
        onClick={openDatePicker}
        className={className}
    />
);
}