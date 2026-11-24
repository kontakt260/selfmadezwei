"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { ImageSection } from "../ImageSection";
import { useImageSections } from "../ImageSectionsContext";
import {
  IMAGE_SECTION,
  findSectionPos,
  insertImageSectionTr,
  removeImageSectionTr,
  sectionIdsIn,
  sectionNextToCursor,
  separateSectionsTr,
} from "./imageSectionRules";

// PROJ-34: Bildabschnitt als eigener Block im Text. Im Dokument steht nur die
// ID, Fotos und Layout liegen in `image_sections`. So holt „Rückgängig" einen
// entfernten Abschnitt zurück, ohne einzelne Uploads zurückzudrehen.

export type SectionRemovalRequest = {
  sectionIds: string[];
  confirm: () => void;
};

export type ImageSectionStorage = {
  /** Fragt nach, bevor Abschnitte mit Fotos aus dem Text verschwinden. */
  onRemovalRequest: ((request: SectionRemovalRequest) => void) | null;
};

declare module "@tiptap/core" {
  interface Storage {
    imageSection: ImageSectionStorage;
  }
  interface Commands<ReturnType> {
    imageSection: {
      insertImageSection: (sectionId: string) => ReturnType;
      /** Entfernt ohne Rückfrage, die Person hat bereits bestätigt. */
      removeImageSection: (sectionId: string) => ReturnType;
    };
  }
}

const CONFIRMED = "imageSectionRemovalConfirmed";

function ImageSectionView({ node }: ReactNodeViewProps) {
  const api = useImageSections();
  const sectionId = node.attrs.sectionId as string;
  const data = api?.sectionById(sectionId);
  return (
    <NodeViewWrapper data-image-section={sectionId}>
      {api && data && (
        <ImageSection
          data={data}
          readOnly={api.readOnly}
          freshLinks={api.freshLinks}
          canAddPhoto={api.canAddPhoto(sectionId)}
          onChange={(next) => api.changeSection(sectionId, next)}
          onUpload={(image) => api.uploadPhoto(sectionId, image)}
          onDelete={(image) => api.deletePhoto(sectionId, image)}
          onRemoveSection={() => api.removeSection(sectionId)}
          onPhotoError={api.onPhotoError}
        />
      )}
    </NodeViewWrapper>
  );
}

export const ImageSectionNode = Node.create<object, ImageSectionStorage>({
  name: IMAGE_SECTION,
  // Eigene Gruppe: Abschnitte stehen nur auf oberster Ebene, nie in Listen oder Zitaten.
  group: "imageBlock",
  atom: true,
  selectable: false,
  draggable: false,
  priority: 1000,

  addStorage() {
    return { onRemovalRequest: null };
  },

  addAttributes() {
    return {
      sectionId: {
        default: null,
        rendered: false,
      },
    };
  },

  // Kein Einlesen aus HTML: Kopierter Text bringt nie einen Abschnitt mit,
  // sonst würden sich zwei Abschnitte dieselben Fotos teilen.
  parseHTML() {
    return [];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-image-section": node.attrs.sectionId })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageSectionView, {
      // Klicks, Tasten und Verschieben im Abschnitt gehören nicht dem Text.
      stopEvent: () => true,
      ignoreMutation: () => true,
    });
  },

  addCommands() {
    return {
      insertImageSection:
        (sectionId) =>
        ({ state, dispatch }) => {
          const tr = insertImageSectionTr(state, sectionId);
          if (!tr) return false;
          dispatch?.(tr);
          return true;
        },
      removeImageSection:
        (sectionId) =>
        ({ state, dispatch }) => {
          const pos = findSectionPos(state.doc, sectionId);
          if (pos === null) return false;
          dispatch?.(removeImageSectionTr(state, pos).setMeta(CONFIRMED, true));
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    const removeNext = (direction: -1 | 1) => () => {
      const { state, view } = this.editor;
      if (!view.editable) return false;
      const pos = sectionNextToCursor(state, direction);
      if (pos === null) return false;
      view.dispatch(removeImageSectionTr(state, pos));
      return true;
    };
    return { Backspace: removeNext(-1), Delete: removeNext(1) };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const editor = this.editor;

    const askBeforeRemoving = (tr: Transaction, sectionIds: string[]) => {
      const request = storage.onRemovalRequest;
      if (!request) return;
      queueMicrotask(() =>
        request({
          sectionIds,
          confirm: () => {
            // Nur anwenden, wenn sich der Text seit der Frage nicht geändert hat.
            if (editor.state.doc !== tr.before) return;
            editor.view.dispatch(tr.setMeta(CONFIRMED, true));
          },
        }),
      );
    };

    return [
      new Plugin({
        key: new PluginKey("imageSectionRules"),
        // Eine Stelle für alle Wege: Tasten, Ausschneiden, Überschreiben,
        // Einfügen und Tablet-Tastatur.
        filterTransaction(tr) {
          if (!tr.docChanged || tr.getMeta(CONFIRMED) || isHistoryTransaction(tr)) return true;
          const after = sectionIdsIn(tr.doc);
          if (new Set(after).size !== after.length) return false;
          const removed = sectionIdsIn(tr.before).filter((id) => !after.includes(id));
          if (removed.length === 0 || !storage.onRemovalRequest) return true;
          askBeforeRemoving(tr, removed);
          return false;
        },
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          return separateSectionsTr(newState);
        },
      }),
    ];
  },
});
