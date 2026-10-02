// 精确枚举:读入 5 条轴带 + 赔付表,输出 (线赢总额 L[线投注倍数], 特殊符号数 k) 的计数直方图。
// 输入(stdin): game(0=A,1=B) nlines; lines(nlines*5 个 0-based 行号); 赔付表 nsym 行*3;
//   然后 5 行: len sym0 sym1 ... (A: 0..8=H1..L5, 9=W, 10=S; B: 0..6=H1..L4, 7=C)
// 输出: 每行 "L k count"
#include <stdio.h>
#include <stdlib.h>
#include <omp.h>
#define MAXL 16384
int main(){
  int game,nl; if(scanf("%d %d",&game,&nl)!=2) return 1;
  int lr[20][5];
  for(int i=0;i<nl;i++)for(int j=0;j<5;j++){int r;if(scanf("%d",&r)!=1)return 1;lr[i][j]=j*3+r;}
  int nsym = game==0?9:7; int pay[9][3];
  for(int i=0;i<nsym;i++)for(int j=0;j<3;j++)if(scanf("%d",&pay[i][j])!=1)return 1;
  int len[5]; int st[5][512];
  for(int r=0;r<5;r++){if(scanf("%d",&len[r])!=1)return 1;for(int i=0;i<len[r];i++)if(scanf("%d",&st[r][i])!=1)return 1;}
  int W = game==0?9:-1, SPEC = game==0?10:7;
  int nt = omp_get_max_threads();
  long **th = malloc(nt*sizeof(long*));
  for(int t=0;t<nt;t++) th[t]=calloc((size_t)MAXL*16,sizeof(long));
  int total01 = len[0]*len[1];
  #pragma omp parallel for schedule(dynamic)
  for(int ab=0; ab<total01; ab++){
    int t=omp_get_thread_num(); long *h=th[t];
    int a=ab/len[1], b=ab%len[1];
    int g[15];
    for(int k=0;k<3;k++){g[k]=st[0][(a+k)%len[0]];g[3+k]=st[1][(b+k)%len[1]];}
    for(int c=0;c<len[2];c++){
      for(int k=0;k<3;k++)g[6+k]=st[2][(c+k)%len[2]];
      for(int d=0;d<len[3];d++){
        for(int k=0;k<3;k++)g[9+k]=st[3][(d+k)%len[3]];
        for(int e=0;e<len[4];e++){
          for(int k=0;k<3;k++)g[12+k]=st[4][(e+k)%len[4]];
          int L=0,cnt=0;
          for(int i=0;i<15;i++) if(g[i]==SPEC) cnt++;
          for(int li=0;li<nl;li++){
            int x=g[lr[li][0]]; if(x>=nsym) continue;
            int n=1;
            for(int i=1;i<5;i++){int v=g[lr[li][i]]; if(v==x||v==W)n++; else break;}
            if(n>=3)L+=pay[x][n-3];
          }
          if(L>=MAXL){ fprintf(stderr,"L overflow %d\n",L); exit(2);}
          h[L*16+cnt]++;
        }
      }
    }
  }
  for(int L=0;L<MAXL;L++)for(int k=0;k<16;k++){long s=0;for(int t=0;t<nt;t++)s+=th[t][L*16+k]; if(s)printf("%d %d %ld\n",L,k,s);}
  return 0;
}
