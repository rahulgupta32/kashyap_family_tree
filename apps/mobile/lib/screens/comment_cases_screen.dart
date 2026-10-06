import 'package:flutter/material.dart';
import '../services/genealogy_api_service.dart';

class CommentCasesScreen extends StatefulWidget {
 final GenealogyApiService api; final String postId;
 const CommentCasesScreen({super.key,required this.api,required this.postId});
 @override
 State<CommentCasesScreen> createState()=>_CommentCasesScreenState();
}
class _CommentCasesScreenState extends State<CommentCasesScreen>{
 Map? _page; String? _error; bool _busy=false;
 @override
 void initState(){super.initState();_load();}
 Future<void> _load([String? before]) async {
  setState(()=>_busy=true);
  try {final page=await widget.api.requestJson('/community/posts/${widget.postId}/comment-reports${before==null?'':'?before=${Uri.encodeComponent(before)}'}');if(mounted){setState((){_page=page as Map;_error=null;});}}
  catch(e){if(mounted){setState((){_page=null;_error=e.toString();});}}
  finally{if(mounted){setState(()=>_busy=false);}}
 }
 Future<void> _review(Map c,String decision) async {
  final result=await Navigator.push<Map>(context,MaterialPageRoute(builder:(_)=>const CommentReportEditor(review:true)));
  if(!mounted||result==null){return;}
  setState(()=>_busy=true);
  try{await widget.api.requestJson('/community/posts/${widget.postId}/comment-reports/${c['sequence']}/review',method:'POST',data:{'decision':decision,'notes':result['reason']});if(mounted){await _load();}}
  catch(e){if(mounted){setState(()=>_error=e.toString());}}
  finally{if(mounted){setState(()=>_busy=false);}}
 }
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Comment report cases')),body:ListView(padding:const EdgeInsets.all(16),children:[
  if(_error!=null)Text(_error!),
  ...((_page?['items'] as List?) ?? []).map<Widget>((c)=>Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(c['content']),Text('${c['category']} · ${c['reason']}'),Text('${c['status']} · ${c['reviewNotes']??''}'),if(c['status']=='OPEN'&&c['removed']!=true)Wrap(children:[TextButton(onPressed:_busy?null:()=>_review(c as Map,'KEEP'),child:const Text('Keep comment')),TextButton(onPressed:_busy?null:()=>_review(c as Map,'REMOVE'),child:const Text('Remove reported comment'))])])))),
  TextButton(onPressed:_busy?null:()=>_load(),child:const Text('Latest comment cases')),
  TextButton(onPressed:_busy||_page?['nextBefore']==null?null:()=>_load(_page!['nextBefore'] as String),child:const Text('Older comment cases')),
 ]));
}
class CommentReportEditor extends StatefulWidget {
 final bool review;
 const CommentReportEditor({super.key,this.review=false});
 @override
 State<CommentReportEditor> createState()=>_CommentReportEditorState();
}
class _CommentReportEditorState extends State<CommentReportEditor>{
 final _reason=TextEditingController();String _category='OTHER';
 @override
 void dispose(){_reason.dispose();super.dispose();}
 @override
 Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text(widget.review?'Review comment case':'Report comment')),body:ListView(padding:const EdgeInsets.all(16),children:[
  if(!widget.review)DropdownButtonFormField<String>(initialValue:_category,decoration:const InputDecoration(labelText:'Report category'),items:['ABUSE','PRIVACY','SPAM','OTHER'].map((c)=>DropdownMenuItem(value:c,child:Text(c))).toList(),onChanged:(v)=>setState(()=>_category=v!)),
  TextField(controller:_reason,maxLength:1000,onChanged:(_)=>setState((){}),decoration:InputDecoration(labelText:widget.review?'Review notes':'Comment report reason')),
  FilledButton(onPressed:_reason.text.trim().length<5?null:()=>Navigator.pop(context,{'reason':_reason.text.trim(),if(!widget.review)'category':_category}),child:Text(widget.review?'Submit review':'Submit comment report')),
 ]));
}
