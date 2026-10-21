import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt, json
meses=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
truth={}
def save(fig,ax,name,data,ticks):
    fig.savefig(name+'.png',dpi=100); 
    H=fig.get_size_inches()[1]*100
    cal=[H-ax.transData.transform((0,t))[1] for t in ticks]
    truth[name]=dict(data=data,ticks=ticks,calpx=cal)
# line, 2 series
a=[42,51,47.5,62,58,71,68.5,75,80,77,85,90]; b=[30,33,38,36,40,45,43,50,48,55,53,60]
fig,ax=plt.subplots(figsize=(9,5)); ax.plot(meses,a,color='#E4572E',lw=2.5); ax.plot(meses,b,color='#17BEBB',lw=2.5)
ax.set_ylim(0,100); ax.set_yticks([0,20,40,60,80,100]); ax.grid(axis='y',color='#dddddd'); ax.set_title('Receita')
save(fig,ax,'linha',{'s1':a,'s2':b},[0,100])
c=[12,19,7,15,22,9]
fig,ax=plt.subplots(figsize=(8,5)); ax.bar(['A','B','C','D','E','F'],c,color='#4C3BCF')
ax.set_ylim(0,25); ax.grid(axis='y',color='#dddddd'); ax.set_axisbelow(True)
save(fig,ax,'barras',{'s1':c},[0,25])
json.dump(truth,open('truth.json','w'))
