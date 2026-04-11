"use client";

import React, { useEffect, useMemo, useRef } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { uploadImg } from "@/api/client";
import Swal from "sweetalert2";
import { useLoadingStore } from "@/store/loadingStore";

interface Props {
    value: string;
    onChange: (content: string) => void;
    quillRef: React.RefObject<ReactQuill | null>;
    imageHandler: () => void;
}

export default function CustomEditor({ value, onChange, quillRef, imageHandler }: Props) {
    const showLoading = useLoadingStore((s) => s.show);
    const hideLoading = useLoadingStore((s) => s.hide);

    const uploadImageRef = useRef<(file: File) => Promise<void>>(null!);
    uploadImageRef.current = async (file: File) => {
        try {
            showLoading();
            const response = await uploadImg(file);
            const imageUrl = response.data;
            const quill = quillRef.current?.getEditor();
            if (quill) {
                const range = quill.getSelection();
                const index = range ? range.index : quill.getLength();
                quill.insertEmbed(index, "image", imageUrl);
                quill.setSelection(index + 1, 0);
            }
        } catch (error) {
            Swal.fire("이미지 업로드 실패");
        } finally {
            hideLoading();
        }
    };

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ header: [1, 2, 3, 4, false] }],
                ["bold", "italic", "underline", "strike"],
                ["image", "link"],
                ["clean"],
            ],
            handlers: { image: imageHandler },
        },
        // ✅ clipboard matcher는 유지 (blob delta 혹시라도 생기면 차단)
        clipboard: {
            matchers: [
                [
                    Node.ELEMENT_NODE,
                    (_node: Element, delta: unknown) => {
                        const d = delta as { ops: Array<{ insert?: unknown }> };
                        d.ops = d.ops.filter((op) => {
                            if (op.insert && typeof op.insert === "object") {
                                const ins = op.insert as Record<string, unknown>;
                                if (typeof ins.image === "string") {
                                    const src = ins.image;
                                    if (src.startsWith("blob:") || src.startsWith("data:")) {
                                        console.log("[matcher] blob/base64 차단:", src.slice(0, 60));
                                        return false;
                                    }
                                }
                            }
                            return true;
                        });
                        return d;
                    },
                ],
            ],
        },
    }), [imageHandler]);

    useEffect(() => {
        // ✅ document 레벨 capture — Quill보다 무조건 먼저 실행됨
        const handlePaste = (e: ClipboardEvent) => {
            const target = e.target as HTMLElement;

            // ✅ 이벤트가 이 에디터의 ql-editor 안에서 발생한 경우만 처리
            const editorRoot = quillRef.current?.getEditor()?.root;
            if (!editorRoot) return;
            if (!editorRoot.contains(target) && editorRoot !== target) return;

            console.log("[CustomEditor] document paste 감지 (capture)");

            const items = e.clipboardData?.items;
            if (!items) return;

            console.log("[CustomEditor] items:", Array.from(items).map(i => `${i.kind}:${i.type}`));

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith("image/")) {
                    console.log("[CustomEditor] 이미지 감지 → 업로드 처리");
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const file = items[i].getAsFile();
                    if (file) void uploadImageRef.current(file);
                    return;
                }
            }
        };

        // ✅ document에 capture로 등록 → Quill보다 먼저 실행
        document.addEventListener("paste", handlePaste, true);
        console.log("[CustomEditor] document paste 리스너 등록");

        return () => {
            document.removeEventListener("paste", handlePaste, true);
            console.log("[CustomEditor] document paste 리스너 제거");
        };
    }, []);

    return (
        <ReactQuill
            modules={modules}
            ref={quillRef}
            theme="snow"
            value={value}
            onChange={onChange}
            placeholder="상세 내용을 입력해주세요."
            className="mt8"
            style={{ height: "250px", marginBottom: "60px" }}
        />
    );
}