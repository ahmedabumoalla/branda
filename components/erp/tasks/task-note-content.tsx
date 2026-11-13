import {safeErpRichText} from '@/lib/erp/custom-fields';
import type {TaskNote} from '@/lib/erp/tasks';
import s from '../erp.module.css';
export function TaskNoteContent({note}:{note:TaskNote}){
 return <div className={s.body}>
  {note.note_format==='rich'?<div style={{overflowWrap:'anywhere'}} dangerouslySetInnerHTML={{__html:safeErpRichText(note.note)}}/>:<p style={{whiteSpace:'pre-wrap'}}>{note.note}</p>}
  {!!note.tags?.length&&<div className={s.inline} aria-label="وسوم الملاحظة">{note.tags.map(tag=><span key={tag} className={s.badge}>{tag}</span>)}</div>}
 </div>;
}
