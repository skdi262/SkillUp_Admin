"use client";

import React, { useEffect, useMemo, useCallback } from "react";
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

    // 이미지 업로드 로직 메모이제이션 (중복 생성 방지)
    const uploadImage = useCallback(async (file: File) => {
        try {
            showLoading();
            const response = await uploadImg(file);
            const imageUrl = response.data;
            const quill = quillRef.current?.getEditor();
            if (quill) {
                const range = quill.getSelection();
                // 커서 위치가 없으면 맨 마지막에 삽입
                const index = range ? range.index : quill.getLength();
                quill.insertEmbed(index, 'image', imageUrl);
                // 삽입 후 커서를 이미지 다음으로 이동
                quill.setSelection(index + 1, 0);
            }
        } catch (error) {
            Swal.fire('이미지 업로드 실패');
        } finally {
            hideLoading();
        }
    }, [showLoading, hideLoading, quillRef]);

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ header: [1, 2, 3, 4, false] }],
                ["bold", "italic", "underline", "strike"],
                ["image", "link"],
                ["clean"],
            ],
            handlers: {
                image: imageHandler,
            },
        },
        clipboard: {
            matchers: [
                [
                    Node.ELEMENT_NODE,
                    (node: Element, delta: unknown) => {
                        // blob: URL로 삽입되는 이미지 ops 제거
                        const d = delta as { ops: Array<{ insert?: unknown }> };
                        d.ops = d.ops.filter((op) => {
                            if (op.insert && typeof op.insert === "object") {
                                const insert = op.insert as Record<string, unknown>;
                                if (
                                    typeof insert.image === "string" &&
                                    insert.image.startsWith("blob:")
                                ) {
                                    return false; // blob 이미지 차단
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
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith("image/")) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const file = items[i].getAsFile();
                    if (file) void uploadImage(file);
                    return;
                }
            }
        };

        // ReactQuill은 마운트 후 바로 getEditor() 가능
        const editor = quillRef.current?.getEditor();
        if (!editor?.root) return;

        editor.root.addEventListener("paste", handlePaste, true); // capture phase

        return () => {
            editor.root.removeEventListener("paste", handlePaste, true);
        };
    }, [quillRef, uploadImage]); // uploadImage가 안정적이므로 한 번만 실행됨

    return (
        <ReactQuill
            modules={modules}
            ref={quillRef}
            theme="snow"
            value={value}
            onChange={onChange}
            placeholder="상세 내용을 입력해주세요."
            className="mt8"
            style={{ height: "250px", marginBottom: "60px" }} // 높이 살짝 조절
        />
    );
}