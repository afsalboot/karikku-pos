"use client";
import { createContext, useContext } from "react";
export const SettingsContext = createContext(null);
export const useSettingsDraft = () => useContext(SettingsContext);
export const getPath = (obj,path) => path.split(".").reduce((v,k)=>v?.[k],obj);
export function setPath(obj,path,value) {const [key,...rest]=path.split(".");return {...obj,[key]:rest.length?setPath(obj[key],rest.join("."),value):value};}
export function SettingsCard({title,description,children}) {return <section className="sm-card"><header><h2>{title}</h2>{description&&<p>{description}</p>}</header>{children}</section>;}
export function FormField({path,label,options,type="text",min,max,step,help,full=false,required=false}) {
 const {draft,set,errors}=useSettingsDraft(), error=errors[path], id="setting-"+path;
 const props={id,value:getPath(draft,path)??"","aria-invalid":Boolean(error),"aria-describedby":error?"error-"+path:undefined,onChange:e=>set(path,type==="number"?(e.target.value===""?"":Number(e.target.value)):e.target.value)};
 return <div className={"sm-field "+(full?"sm-full":"")} data-setting={path}><label htmlFor={id}>{label}{required?" *":""}</label>{options?<select {...props}>{options.map(o=><option key={Array.isArray(o)?o[0]:o} value={Array.isArray(o)?o[0]:o}>{Array.isArray(o)?o[1]:o}</option>)}</select>:type==="textarea"?<textarea {...props} maxLength={max}/>:<input {...props} type={type} min={min} max={type==="number"?max:undefined} maxLength={type!=="number"?max:undefined} step={step}/>}
 {error?<small className="sm-error" id={"error-"+path}>{error}</small>:help&&<small>{help}</small>}</div>;
}
export function Switch({checked,onChange,label,disabled=false}) {return <button className="sm-switch" type="button" role="switch" aria-label={label} aria-checked={Boolean(checked)} disabled={disabled} onClick={()=>onChange(!checked)}><span/></button>;}
export function ToggleRow({path,label,description,disabled=false}) {const {draft,set}=useSettingsDraft(),checked=getPath(draft,path);return <div className="sm-toggle-row" data-setting={path}><div><strong>{label}</strong>{description&&<small>{description}</small>}</div><span className="sm-toggle-status">{checked?"Enabled":"Disabled"}</span><Switch label={label} checked={checked} disabled={disabled} onChange={v=>set(path,v)}/></div>;}

