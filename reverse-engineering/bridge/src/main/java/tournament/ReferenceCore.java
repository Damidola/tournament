package tournament;

import java.io.*;
import java.util.*;
import C9.*;
import org.teavm.jso.JSExport;

/** Calls the original 1.2.88 bytecode, rather than approximating Dutch pairing. */
public final class ReferenceCore {
  private static final l1 ENGINE=new l1(20000,8192,200000,512,8192,250000,32,65536);
  @SuppressWarnings("unchecked") private static Map<String,Object> object(Object o){return (Map<String,Object>)o;}
  @SuppressWarnings("unchecked") private static List<Object> list(Object o){return o==null?Collections.emptyList():(List<Object>)o;}
  private static String text(Map<String,Object> m,String k,String fallback){Object v=m.get(k);return v==null?fallback:String.valueOf(v);}
  private static double num(Map<String,Object> m,String k,double fallback){Object v=m.get(k);return v instanceof Number?((Number)v).doubleValue():fallback;}
  private static boolean flag(Map<String,Object> m,String k,boolean fallback){Object v=m.get(k);return v instanceof Boolean?(Boolean)v:fallback;}
  private static Set<String> names(Object o){Set<String>s=new LinkedHashSet<>();for(Object v:list(o))s.add(String.valueOf(v));return s;}
  @JSExport public static String calculate(String input) {
    try {
      Map<String,Object> request=object(Json.parse(input));String op=text(request,"operation","pair");
      if(op.equals("tieBreaks"))return tieBreaks(request);
      if(op.equals("flexiblePair"))return flexiblePair(request);
      if(op.equals("arenaPair"))return arenaPair(request);
      if(op.equals("ratings"))return ratings(request);
      if(op.equals("teamPair"))return teamPair(request);
      if(op.equals("roundRobin"))return roundRobin(request);
      if(op.equals("knockoutSlots"))return knockoutSlots(request);
      if(op.equals("exportTrf"))return exportTrf(request);
      if(op.equals("importTrf"))return importTrf(request);
      List<E1> players=new ArrayList<>();
      for(Object item:list(request.get("players"))){Map<String,Object> p=object(item);List<w0> colors=new ArrayList<>();for(Object c:list(p.get("colors")))colors.add(String.valueOf(c).equals("w")?w0.a:w0.b);
        List<x0> roundFloats=new ArrayList<>();for(Object f:list(p.get("floats")))roundFloats.add(f==null?null:x0.valueOf(String.valueOf(f)));
        List<x0> floats=new ArrayList<>();for(x0 f:roundFloats)if(f!=null)floats.add(f);
        players.add(new E1(text(p,"id",""),(int)num(p,"seed",players.size()+1),num(p,"points",0),(int)num(p,"rating",0),num(p,"bh",0),num(p,"bhc1",0),(int)num(p,"wins",0),(int)num(p,"joinedRound",1),p.get("removedRound")==null?null:(int)num(p,"removedRound",0),flag(p,"active",true),flag(p,"topScorer",false),flag(p,"hadBye",false),names(p.get("opponents")),colors,floats,names(p.get("forbiddenOpponents")),(int)num(p,"seed",players.size()+1),roundFloats,(int)num(p,"played",colors.size())));
      }
      D1 mode=text(request,"mode","DEFAULT").equals("FIDE_DUTCH_STRICT")?D1.b:D1.a;
      w0 color=text(request,"initialColor","white").equals("black")?w0.b:w0.a;
      int round=(int)num(request,"round",1);
      G1 result;
      if(round==1){List<F1> initial=new ArrayList<>();for(E1 p:players)initial.add(p.t);result=ENGINE.Y2(new y0(initial,text(request,"forcedBye",null),mode,color));}
      else result=ENGINE.Q2(new I1(round,J1.a(players,round,(int)num(request,"totalRounds",5)),text(request,"forcedBye",null),mode,color));
      List<Object> pairs=new ArrayList<>();for(Object raw:result.c()){C1 pair=(C1)raw;Map<String,Object> m=new LinkedHashMap<>();m.put("white",pair.b().e());m.put("black",pair.a().e());pairs.add(m);}
      Map<String,Object> out=new LinkedHashMap<>();out.put("matches",pairs);out.put("bye",result.a());out.put("diagnostics",result.b());return Json.write(out);
    } catch(Throwable e){Map<String,Object> error=new LinkedHashMap<>();error.put("error",e.getClass().getName()+": "+e.getMessage());return Json.write(error);}
  }
  private static String flexiblePair(Map<String,Object> request){
    BridgeDao dao=new BridgeDao();List<B9.n> players=new ArrayList<>();
    for(Object raw:list(request.get("players"))){Map<String,Object> p=object(raw);String id=text(p,"id","");List<String> opponents=new ArrayList<>(names(p.get("opponents")));List<String> colors=new ArrayList<>();for(Object c:list(p.get("colors")))colors.add(String.valueOf(c).equals("w")?"WHITE":"BLACK");dao.colors.put(id,colors);if(!flag(p,"hadBye",false))dao.neverBye.add(id);
      players.add(new B9.n(id,opponents,num(p,"points",0),(int)num(p,"rating",0),null,(int)num(p,"k",20),0,num(p,"bh",0),num(p,"bhc1",0),(int)num(p,"wins",0),num(p,"sb",0),false,null));
    }
    x6.e continuation=new x6.e(){public x6.i getContext(){return x6.j.a;}public void resumeWith(Object value){throw new IllegalStateException("Unexpected asynchronous database call");}};
    X9.I0 repo=new X9.I0(dao,null);X9.I0.d result=(X9.I0.d)repo.P0(0,players,text(request,"forcedBye",null),continuation);
    List<Object> pairs=new ArrayList<>();for(Object raw:result.b()){X9.I0.c p=(X9.I0.c)raw;Map<String,Object> m=new LinkedHashMap<>();m.put("white",p.b().k());m.put("black",p.a().k());pairs.add(m);}
    Map<String,Object> out=new LinkedHashMap<>();out.put("matches",pairs);out.put("bye",result.a()==null?null:result.a().k());out.put("diagnostics",Collections.singletonList("Original graph-weighted flexible Swiss engine"));return Json.write(out);
  }
  private static String tieBreaks(Map<String,Object> request){
    List<D9.a.b> players=new ArrayList<>();
    for(Object item:list(request.get("players"))){Map<String,Object> p=object(item);List<D9.a.d> rounds=new ArrayList<>();for(Object raw:list(p.get("entries"))){Map<String,Object> r=object(raw);rounds.add(new D9.a.d((int)num(r,"round",1),num(r,"score",0),D9.a.e.valueOf(text(r,"type","PLAYED")),text(r,"opponent",null)));}players.add(new D9.a.b(text(p,"id",""),num(p,"points",0),rounds));}
    Map<?,?> results=D9.a.a.b(players,(int)num(request,"totalRounds",5),0.5);
    Map<String,Object> out=new LinkedHashMap<>();for(Map.Entry<?,?> e:results.entrySet()){D9.a.c r=(D9.a.c)e.getValue();Map<String,Object> item=new LinkedHashMap<>();item.put("adjusted",r.a);item.put("bh",r.b);item.put("bhc1",r.c);item.put("sb",r.d);List<Object> contrib=new ArrayList<>();for(Object x:r.e){D9.a.a c=(D9.a.a)x;Map<String,Object> v=new LinkedHashMap<>();v.put("round",c.a);v.put("contribution",c.b);v.put("score",c.c);v.put("voluntary",c.d);contrib.add(v);}item.put("entries",contrib);out.put(String.valueOf(e.getKey()),item);}return Json.write(out);
  }
  private static String ratings(Map<String,Object> request){
    List<W5.h> entries=new ArrayList<>();List<W5.g> games=new ArrayList<>();
    for(Object raw:list(request.get("players"))){Map<String,Object> p=object(raw);int rating=(int)num(p,"rating",0);entries.add(new W5.h(text(p,"id",""),rating,W5.a.b((int)num(p,"k",20),rating),(int)num(p,"joinedRound",1),p.get("removedRound")==null?null:(int)num(p,"removedRound",0)));}
    for(Object raw:list(request.get("games"))){Map<String,Object> g=object(raw);double score=num(g,"score",0);games.add(new W5.g((int)num(g,"round",1),text(g,"white",""),text(g,"black",""),score,1-score));}
    W5.i result=W5.c.c(entries,games);Map<String,Object> out=new LinkedHashMap<>();out.put("final",result.a());List<Object> history=new ArrayList<>();
    for(Object raw:result.b().entrySet()){Map.Entry e=(Map.Entry)raw;s6.q key=(s6.q)e.getKey();W5.j v=(W5.j)e.getValue();Map<String,Object> h=new LinkedHashMap<>();h.put("round",key.a());h.put("id",key.b());h.put("before",v.a);h.put("change",v.b);h.put("after",v.c);history.add(h);}out.put("history",history);return Json.write(out);
  }
  private static String arenaPair(Map<String,Object> request){
    List<String> previous=new ArrayList<>(),added=new ArrayList<>();for(Object v:list(request.get("previousOrder")))previous.add(String.valueOf(v));for(Object v:list(request.get("newPlayers")))added.add(String.valueOf(v));
    Set<x8.k> recent=new LinkedHashSet<>();Map<x8.k,Integer> counts=new LinkedHashMap<>();for(Object raw:list(request.get("history"))){Map<String,Object> p=object(raw);x8.k key=x8.k.c.a(text(p,"white",""),text(p,"black",""));counts.put(key,counts.getOrDefault(key,0)+1);if(flag(p,"previous",false))recent.add(key);}
    Map<String,Integer> byes=new LinkedHashMap<>();Object rawByes=request.get("byes");if(rawByes!=null)for(Map.Entry<String,Object> e:object(rawByes).entrySet())byes.put(e.getKey(),((Number)e.getValue()).intValue());
    x8.l result=new x8.j("BYE").h(new x8.m(previous,added,names(request.get("removedPlayers")),recent,counts,byes,text(request,"previousBye",null),names(request.get("requestedByes"))));
    Map<String,List<x8.a>> colors=new LinkedHashMap<>();Object rawColors=request.get("colors");if(rawColors!=null)for(Map.Entry<String,Object> e:object(rawColors).entrySet()){List<x8.a> values=new ArrayList<>();for(Object c:list(e.getValue()))values.add(String.valueOf(c).equals("w")?x8.a.a:x8.a.b);colors.put(e.getKey(),values);}
    List<Object> pairs=new ArrayList<>();x8.d colorEngine=new x8.d("BYE");for(Object raw:result.a()){x8.e p=colorEngine.c((x8.f)raw,colors,(int)num(request,"round",1)%2==0);Map<String,Object> m=new LinkedHashMap<>();m.put("white",p.b());m.put("black",p.a().equals("BYE")?null:p.a());pairs.add(m);}
    Map<String,Object> out=new LinkedHashMap<>();out.put("matches",pairs);out.put("order",result.a);out.put("bye",result.c);out.put("diagnostics",result.d);return Json.write(out);
  }
  private static String teamPair(Map<String,Object> request){
    List<pa.q> teams=new ArrayList<>();for(Object raw:list(request.get("teams"))){Map<String,Object> t=object(raw);List<pa.g> roster=new ArrayList<>();for(Object player:list(t.get("players"))){Map<String,Object> p=object(player);roster.add(new pa.g(text(p,"id",""),(int)num(p,"rating",0),(int)num(p,"k",20),0));}List<pa.c> colors=new ArrayList<>();for(Object c:list(t.get("colors")))colors.add(String.valueOf(c).equals("w")?pa.c.a:pa.c.b);teams.add(new pa.q(text(t,"id",""),(int)num(t,"seed",teams.size()+1),roster,num(t,"mp",0),num(t,"gp",0),names(t.get("opponents")),colors,flag(t,"hadBye",false),flag(t,"wonByForfeit",false),(int)num(t,"played",0),flag(t,"previousFloater",false)));}
    pa.j result=new na.o().O(new na.p((int)num(request,"round",1),teams,(int)num(request,"boardCount",4),text(request,"initialColor","white").equals("black")?pa.c.b:pa.c.a,text(request,"forcedBye",null)));
    List<Object> pairs=new ArrayList<>();for(Object raw:result.a()){pa.f p=(pa.f)raw;Map<String,Object> m=new LinkedHashMap<>();m.put("white",p.d().g());m.put("black",p.a().g());List<Object> boards=new ArrayList<>();for(Object braw:p.b()){pa.a b=(pa.a)braw;Map<String,Object> board=new LinkedHashMap<>();board.put("whiteTeam",b.f());board.put("blackTeam",b.b());board.put("white",b.e()==null?null:b.e().d());board.put("black",b.a()==null?null:b.a().d());boards.add(board);}m.put("boards",boards);pairs.add(m);}
    Map<String,Object> out=new LinkedHashMap<>();out.put("matches",pairs);out.put("bye",result.c);out.put("diagnostics",result.d);return Json.write(out);
  }
  private static String roundRobin(Map<String,Object> request){
    List<W5.m> players=new ArrayList<>();for(Object raw:list(request.get("players"))){Map<String,Object> p=object(raw);int rating=(int)num(p,"rating",0);players.add(new W5.m(null,null,text(p,"id",""),0.0,0.0,rating,20,rating,null,null,20,null,null,null,null,null,null,null,null));}
    RoundRobinDao dao=new RoundRobinDao();U8.D repo=new U8.D(dao,M6.c.b,null);x6.e continuation=new x6.e(){public x6.i getContext(){return x6.j.a;}public void resumeWith(Object value){throw new IllegalStateException("Unexpected asynchronous database call");}};
    boolean twice=flag(request,"double",false),random=text(request,"seeding","standard").equals("random");List<Object> storedRows=list(request.get("initialRows"));
    if(storedRows.isEmpty())repo.n("",players,twice,random?W8.b.b:W8.b.a,false,continuation);
    else{for(Object raw:storedRows){List<Object> row=list(raw);if(row.size()!=20)throw new IllegalArgumentException("Invalid Round Robin starting grid");dao.initial.add(new U8.F(((Number)row.get(0)).intValue(),((Number)row.get(1)).longValue(),String.valueOf(row.get(2)),((Number)row.get(3)).intValue(),((Number)row.get(4)).intValue(),String.valueOf(row.get(5)),((Number)row.get(6)).doubleValue(),((Number)row.get(7)).intValue(),((Number)row.get(8)).intValue(),((Number)row.get(9)).doubleValue(),((Number)row.get(10)).doubleValue(),String.valueOf(row.get(11)),((Number)row.get(12)).doubleValue(),((Number)row.get(13)).intValue(),((Number)row.get(14)).intValue(),((Number)row.get(15)).doubleValue(),((Number)row.get(16)).doubleValue(),(Boolean)row.get(17),(Boolean)row.get(18),(Boolean)row.get(19)));}dao.current=new ArrayList<>(dao.initial);}
    int number=(int)num(request,"round",1),total=(players.size()%2==0?players.size()-1:players.size())*(twice?2:1);if(number>1)repo.z(number-1,0,"",total,number,false,false,continuation);
    List<Object> pairs=new ArrayList<>();for(U8.F p:dao.current){Map<String,Object> m=new LinkedHashMap<>();String white=p.f,black=p.l;if(white.equals("BYE")){white=black;black="BYE";}m.put("white",white);m.put("black",black.equals("BYE")?null:black);pairs.add(m);}Map<String,Object> out=new LinkedHashMap<>();out.put("matches",pairs);if(random||!storedRows.isEmpty()){List<Object> initialRows=new ArrayList<>();for(U8.F p:dao.initial)initialRows.add(Arrays.asList(p.a,p.b,p.c,p.d,p.e,p.f,p.g,p.h,p.i,p.j,p.k,p.l,p.m,p.n,p.o,p.p,p.q,p.r,p.s,p.t));out.put("initialRows",initialRows);}out.put("diagnostics",Collections.singletonList("Original Round Robin rotation and table ordering"));return Json.write(out);
  }
  private static W5.m rosterPlayer(String id,int rating){return new W5.m(null,null,id,0.0,0.0,rating,20,rating,null,null,20,null,null,null,null,null,null,null,null);}
  private static String knockoutSlots(Map<String,Object> request){
    List<W5.m> players=new ArrayList<>();for(Object raw:list(request.get("players"))){Map<String,Object> p=object(raw);players.add(rosterPlayer(text(p,"id",""),(int)num(p,"rating",0)));}
    K8.x repo=new K8.x(new KnockoutDao(),M6.c.b,null);int size=repo.p(players.size());W5.m bye=rosterPlayer("BYE",0);
    List<?> slots=text(request,"seeding","balanced").equals("random")?repo.q(size,players,bye):repo.s(size,players,bye);
    List<Object> out=new ArrayList<>();for(Object raw:slots){String id=((W5.m)raw).s();out.add(id.equals("BYE")?null:id);}return Json.write(Collections.singletonMap("slots",out));
  }
  private static String exportTrf(Map<String,Object> request){
    List<k2> headers=new ArrayList<>();for(Object raw:list(request.get("headers"))){Map<String,Object> h=object(raw);headers.add(new k2(text(h,"code","012"),text(h,"value",""),0));}
    List<d2> players=new ArrayList<>();for(Object raw:list(request.get("players"))){Map<String,Object> p=object(raw);List<e2> rounds=new ArrayList<>();for(Object entry:list(p.get("rounds"))){Map<String,Object> r=object(entry);String color=text(r,"color",null);rounds.add(new e2((int)num(r,"round",1),r.get("opponent")==null?null:(int)num(r,"opponent",0),color==null?null:color.equals("w")?w0.a:w0.b,text(r,"token","0"),null));}
      players.add(new d2((int)num(p,"seed",players.size()+1),text(p,"sex",null),text(p,"title",null),text(p,"name",""),p.get("rating")==null?null:(int)num(p,"rating",0),text(p,"federation",null),text(p,"fideId",null),text(p,"birthDate",null),num(p,"points",0),p.get("rank")==null?null:(int)num(p,"rank",0),rounds,0));}
    return Json.write(Collections.singletonMap("text",j2.a.e(new g2(headers,players))));
  }
  private static String importTrf(Map<String,Object> request){
    F9.c plan=new F9.a().a(text(request,"text",""));Map<String,Object> out=new LinkedHashMap<>();out.put("name",plan.a);out.put("totalRounds",plan.b);out.put("initialColor",plan.c==w0.a?"white":"black");out.put("blockingIssues",plan.f);
    List<Object> players=new ArrayList<>();for(Object raw:plan.d){F9.e p=(F9.e)raw;Map<String,Object> v=new LinkedHashMap<>();v.put("seed",p.a);v.put("originalName",p.b);v.put("name",p.c);v.put("rating",p.d);v.put("federation",p.e);v.put("title",p.f==null?null:p.f.i());v.put("gender",p.g==null?null:p.g.name());v.put("fideId",p.h);v.put("birthDate",p.i);v.put("points",p.j);v.put("rank",p.k);v.put("joinedRound",p.l);v.put("removedRound",p.m);v.put("startingPoints",p.n);players.add(v);}out.put("players",players);
    List<Object> rounds=new ArrayList<>();for(Object raw:plan.e){F9.k r=(F9.k)raw;Map<String,Object> row=new LinkedHashMap<>();row.put("number",r.a);List<Object> matches=new ArrayList<>();for(Object game:r.b){F9.j m=(F9.j)game;Map<String,Object> v=new LinkedHashMap<>();v.put("white",m.c.a);v.put("black",m.i?null:m.d.a);v.put("whiteScore",m.e);v.put("blackScore",m.f);v.put("status",m.j.name());v.put("byeKind",m.k==null?null:m.k.name());matches.add(v);}row.put("matches",matches);rounds.add(row);}out.put("rounds",rounds);return Json.write(out);
  }
  public static void main(String[] args) throws Exception { if(args.length>0){try(BufferedReader reader=new BufferedReader(new InputStreamReader(System.in))){String line;while((line=reader.readLine())!=null)System.out.println(calculate(line));}} }
}
