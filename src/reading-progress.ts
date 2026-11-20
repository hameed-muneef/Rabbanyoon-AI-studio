const key=(bookId:string)=>`rabbani-reading-page:${bookId}`;

export function savedBookPage(bookId:string,maxPage:number):number|null{
  try{
    const value=Number(localStorage.getItem(key(bookId)));
    return Number.isInteger(value)&&value>=1&&value<=maxPage?value:null;
  }catch{return null}
}

export function saveBookPage(bookId:string,page:number,maxPage:number):boolean{
  if(!Number.isInteger(page)||page<1||page>maxPage)return false;
  try{localStorage.setItem(key(bookId),String(page));return true}catch{return false}
}
