import java.util.*;
import java.util.zip.*;
import java.nio.file.*;
import org.objectweb.asm.*;

/** Repairs Java 8 interface metadata for execution of recovered DEX methods. */
public class FixJvm {
  static Map<String,ClassReader> classes=new HashMap<>();
  static boolean iface(String name){ClassReader c=classes.get(name);return c!=null&&(c.getAccess()&Opcodes.ACC_INTERFACE)!=0;}
  static String parent(String name){ClassReader c=classes.get(name);if(c!=null)return c.getSuperName();try{return Class.forName(name.replace('/','.')).getSuperclass().getName().replace('.','/');}catch(Throwable t){return name.equals("java/lang/Object")?null:"java/lang/Object";}}
  static boolean assign(String target,String name){if(target.equals(name)||target.equals("java/lang/Object"))return true;ClassReader c=classes.get(name);if(c!=null){for(String i:c.getInterfaces())if(assign(target,i))return true;}else{try{return Class.forName(target.replace('/','.')).isAssignableFrom(Class.forName(name.replace('/','.')));}catch(Throwable t){}}
    String p=parent(name);return p!=null&&assign(target,p);
  }
  static String common(String a,String b){if(a.equals(b))return a;if(a.startsWith("[")&&b.startsWith("[")&&a.startsWith("[L")&&b.startsWith("[L"))return "[L"+common(a.substring(2,a.length()-1),b.substring(2,b.length()-1))+";";if(assign(a,b))return a;if(assign(b,a))return b;if(iface(a)||iface(b)||a.startsWith("[")||b.startsWith("["))return "java/lang/Object";do{a=parent(a);}while(a!=null&&!assign(a,b));return a==null?"java/lang/Object":a;}
  public static void main(String[] args)throws Exception{
    try(ZipFile source=new ZipFile(args[0])){
      for(ZipEntry e:Collections.list(source.entries()))if(e.getName().endsWith(".class")){ClassReader c=new ClassReader(source.getInputStream(e));classes.put(c.getClassName(),c);}
      int changed=0;
      try(ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(Path.of(args[1])))){
        for(ZipEntry e:Collections.list(source.entries())){
          byte[] data=source.getInputStream(e).readAllBytes();
          if(e.getName().endsWith(".class")){
            ClassReader reader=classes.get(e.getName().substring(0,e.getName().length()-6));
            boolean[] needs={(reader.getAccess()&Opcodes.ACC_INTERFACE)!=0};
            reader.accept(new ClassVisitor(Opcodes.ASM9){public MethodVisitor visitMethod(int access,String name,String desc,String sig,String[] exc){return new MethodVisitor(Opcodes.ASM9){public void visitMethodInsn(int op,String owner,String name,String desc,boolean itf){if(op==Opcodes.INVOKESTATIC&&iface(owner)&&!itf)needs[0]=true;}};}},ClassReader.SKIP_DEBUG|ClassReader.SKIP_FRAMES);
            if(needs[0]){
              ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_FRAMES){protected String getCommonSuperClass(String a,String b){return common(a,b);}};
              reader.accept(new ClassVisitor(Opcodes.ASM9,writer){public void visit(int v,int access,String name,String sig,String superName,String[] ints){super.visit(Math.max(v,Opcodes.V1_8),access,name,sig,superName,ints);}public MethodVisitor visitMethod(int access,String name,String desc,String sig,String[] exc){return new MethodVisitor(Opcodes.ASM9,super.visitMethod(access,name,desc,sig,exc)){public void visitMethodInsn(int op,String owner,String name,String desc,boolean itf){super.visitMethodInsn(op,owner,name,desc,op==Opcodes.INVOKESTATIC&&iface(owner)||itf);}};}},ClassReader.SKIP_FRAMES);
              data=writer.toByteArray();changed++;
            }
          }
          out.putNextEntry(new ZipEntry(e.getName()));out.write(data);out.closeEntry();
        }
      }
      System.out.println("Normalized Java 8 interface metadata: "+changed+" classes");
    }
  }
}
