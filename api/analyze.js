export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY が設定されていません。' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !['image','text'].includes(body.kind)) return res.status(400).json({ error:'入力形式が正しくありません。' });
    const content=[{type:'text',text:'あなたは業務文書の差分確認担当です。旧版と新版を比較し、重要な変更を日本語で簡潔に説明してください。推測はせず、変更点、業務への影響、確認推奨事項の3項目で回答してください。'}];
    if(body.kind==='image'){
      for(const item of [body.old,body.new]){
        if(!item?.data||!/^image\/(png|jpeg|gif|webp)$/.test(item.mediaType)) return res.status(400).json({error:'対応していない画像形式です。'});
        content.push({type:'image',source:{type:'base64',media_type:item.mediaType,data:item.data}});
      }
      content.push({type:'text',text:'最初の画像が旧版、2枚目が新版です。視覚的な差を比較してください。'});
    }else{
      content.push({type:'text',text:`【旧版】\n${String(body.old||'').slice(0,80000)}\n\n【新版】\n${String(body.new||'').slice(0,80000)}`});
    }
    const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||'claude-sonnet-4-20250514',max_tokens:1400,messages:[{role:'user',content}]})});
    const data=await response.json();
    if(!response.ok){console.error('Anthropic API error',data?.error?.type);return res.status(response.status).json({error:'AI分析に失敗しました。API設定を確認してください。'});}
    return res.status(200).json({analysis:data.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n')||'分析結果がありません。'});
  }catch(error){console.error(error);return res.status(500).json({error:'AI分析中にエラーが発生しました。'});}
}
