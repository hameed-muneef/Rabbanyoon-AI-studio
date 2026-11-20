import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {Check,ChevronDown,Search} from 'lucide-react';
import {countryOptions} from './country-data';
import './country-selector.css';

type Props={id:string;value:string;onChange:(value:string)=>void;required?:boolean};

export default function CountrySelector({id,value,onChange,required=false}:Props){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [activeIndex,setActiveIndex]=useState(0);
  const root=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const selected=countryOptions.find(country=>country.arabic===value);
  const results=useMemo(()=>{
    const normalized=query.trim().toLocaleLowerCase();
    if(!normalized)return countryOptions;
    return countryOptions.filter(country=>[
      country.arabic,country.english,country.code,
    ].some(term=>term.toLocaleLowerCase().includes(normalized)));
  },[query]);

  useEffect(()=>{
    if(!open)return;
    const closeOnOutside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close()};
    document.addEventListener('pointerdown',closeOnOutside);
    return()=>document.removeEventListener('pointerdown',closeOnOutside);
  },[open]);
  useEffect(()=>{
    if(!open||!results[activeIndex])return;
    document.getElementById(`${id}-option-${results[activeIndex].code}`)?.scrollIntoView({block:'nearest'});
  },[activeIndex,id,open,results]);

  const close=()=>{setOpen(false);setQuery('');setActiveIndex(0)};
  const choose=(country:typeof countryOptions[number])=>{onChange(country.arabic);close();input.current?.focus()};
  const handleKeyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(event.key==='ArrowDown'){
      event.preventDefault();
      if(!open){setOpen(true);return}
      setActiveIndex(index=>Math.min(index+1,results.length-1));
    }else if(event.key==='ArrowUp'&&open){event.preventDefault();setActiveIndex(index=>Math.max(index-1,0))}
    else if(event.key==='Enter'&&open){event.preventDefault();if(results[activeIndex])choose(results[activeIndex])}
    else if(event.key==='Escape'&&open){event.preventDefault();close()}
  };

  return <div className="country-selector" ref={root}>
    <div className="country-selector-control">
      {selected&&<span className="country-selector-flag" aria-hidden="true">{selected.flag}</span>}
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open&&results[activeIndex]?`${id}-option-${results[activeIndex].code}`:undefined} aria-required={required} autoComplete="off" value={open?query:(selected?`${selected.arabic} · ${selected.english}`:'')} onFocus={()=>{if(!open){setQuery('');setOpen(true)}}} onClick={()=>{if(!open){setQuery('');setOpen(true)}}} onChange={event=>{setQuery(event.target.value);setActiveIndex(0);setOpen(true)}} onKeyDown={handleKeyDown} placeholder="ابحث عن بلدك" dir="auto"/>
      <button className="country-selector-toggle" type="button" tabIndex={-1} aria-label={open?'إغلاق قائمة الدول':'فتح قائمة الدول'} onClick={()=>{if(open){close()}else{setQuery('');setOpen(true);input.current?.focus()}}}><ChevronDown size={17}/></button>
    </div>
    {open&&<div className="country-selector-menu" dir="rtl">
      <div className="country-selector-search"><Search size={17}/><input role="searchbox" aria-label="ابحث عن بلد" aria-controls={`${id}-options`} aria-activedescendant={results[activeIndex]?`${id}-option-${results[activeIndex].code}`:undefined} value={query} onChange={event=>{setQuery(event.target.value);setActiveIndex(0)}} onKeyDown={handleKeyDown} placeholder="ابحث بالعربية أو الإنجليزية أو الرمز" autoFocus/></div>
      <ul id={`${id}-options`} role="listbox" aria-label="الدول">
        {results.length?results.map((country,index)=><li key={country.code} id={`${id}-option-${country.code}`} role="option" aria-selected={country.arabic===value} className={`country-selector-option${index===activeIndex?' is-active':''}${country.arabic===value?' is-selected':''}`} onMouseEnter={()=>setActiveIndex(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(country)}>
          <span className="country-selector-option-flag" aria-hidden="true">{country.flag}</span><span className="country-selector-names"><span>{country.arabic}</span><small dir="ltr">{country.english}</small></span><bdi className="country-selector-code" dir="ltr">{country.code}</bdi>{country.arabic===value&&<Check className="country-selector-check" size={17} aria-label="مختارة"/>}
        </li>):<li className="country-selector-empty" role="option" aria-disabled="true">لم يتم العثور على دولة بهذا الاسم</li>}
      </ul>
      <div className="country-selector-count">{results.length} دولة</div>
    </div>}
  </div>;
}
