import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  Autoformat, BlockQuote, Bold, ClassicEditor, Essentials, Heading, Italic, Link, List, Paragraph, Strikethrough, Underline,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';

/**
 * CKEditor 5 for formatted text (job details). Loaded lazily – import it with React.lazy.
 * The server sanitises the HTML and keeps a plain-text copy for lists and the mobile apps.
 */
export default function RichTextEditor({ value, onChange, placeholder, invalid }: { value: string; onChange: (html: string) => void; placeholder?: string; invalid?: boolean }) {
  return (
    <div className={invalid ? 'rich-editor rich-editor-invalid' : 'rich-editor'}>
      <CKEditor
        editor={ClassicEditor}
        data={value}
        config={{
          licenseKey: 'GPL',
          plugins: [Essentials, Paragraph, Heading, Bold, Italic, Underline, Strikethrough, List, Link, BlockQuote, Autoformat],
          toolbar: ['heading', '|', 'bold', 'italic', 'underline', 'strikethrough', '|', 'bulletedList', 'numberedList', 'blockQuote', '|', 'link', '|', 'undo', 'redo'],
          heading: {
            options: [
              { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
              { model: 'heading3', view: 'h3', title: 'Heading', class: 'ck-heading_heading3' },
              { model: 'heading4', view: 'h4', title: 'Subheading', class: 'ck-heading_heading4' },
            ],
          },
          link: { defaultProtocol: 'https://' },
          placeholder,
        }}
        onChange={(_, editor) => onChange(editor.getData())}
      />
    </div>
  );
}
