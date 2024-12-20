/* eslint-disable no-var */
import { Command, program } from 'commander';
import { version } from '../../package.json';
import seqMain from './seq'
import path from 'path';
import fsP from 'fs/promises'
import fs from 'fs'
import { DataSet } from 'src/preload/data';
import { Logger, transports } from 'winston'
import { exit } from 'process';
import { format } from 'winston'
import { createLogs } from 'src/main/log';
import Transport from 'winston-transport'
import colors from 'colors';
import { CanMessage } from 'src/main/share/can';
import { ServiceItem } from 'src/main/share/uds';

declare global {
    var sysLog: Logger
    var scriptLog: Logger
}

async function parseProject(projectPath: string): Promise<{
    data: DataSet,
    projectPath: string,
    projectName: string
}> {
    if (!path.isAbsolute(projectPath)) {
        projectPath = path.join(process.cwd(), projectPath)
    }
    if (!fs.existsSync(projectPath)) {
        throw new Error(`project file ${projectPath} not found`)
    }

    try {
        const content = await fsP.readFile(projectPath, 'utf-8')
        const data = JSON.parse(content)
        const info = path.parse(projectPath)
        return {
            data:data.data,
            projectPath: info.dir,
            projectName: info.base
        }
    }
    catch (e) {
        throw new Error(`project file ${projectPath} is not a valid file`)
    }

}

const myFormat = format.printf(({ level, message, label, timestamp }) => {
    const map:Record<string,any>={
        'info':colors.green,
        'warn':colors.yellow,
        'error':colors.red,
        'debug':colors.gray
    }
    let msg=message as any
    const fn=map[level]||colors.white
   
    if (typeof msg === 'object') {
      
        if(msg.method=='canBase'){
            const data=msg.data as CanMessage
            //hex string  with space two by two
            const hexData = data.data.toString('hex').match(/.{2}/g)?.join(' ');
            const msgTypeStr = [
                data.msgType.canfd ? 'CAN-FD' : 'CAN',
                data.msgType.brs ? 'BRS' : '',
                data.msgType.remote ? 'REMOTE' : ''
              ].filter(Boolean).join(' ');
// 将 ID 转换为十六进制
const hexId = data.id.toString(16);
            msg=` ${data.device} | ${data.dir} |ID: 0x${hexId} | TS: ${data.ts} | ${msgTypeStr} | ${hexData}`;
        }else if(msg.method=='udsSent'||msg.method=='udsRecv'){
            const data=msg.data as {service: ServiceItem, ts: number, recvData?: Buffer, msg?: string}
            const hexData = data.recvData?.toString('hex').match(/.{2}/g)?.join(' ');
            msg=`${data.service.name} | ${msg.method=='udsSent'?'Req':'Resp'} |TS: ${data.ts} | ${hexData}`
        }else if(msg.method=='udsIndex'){
            const data=msg.data as {index: number,serviceName:string, action: 'start' | 'finished' | 'progress', percent?: number}
            if(data.percent!=undefined){
                msg=`${data.serviceName}#${data.index} | ${data.action} | ${data.percent.toFixed(2)}%`
            }else{
                msg=`${data.serviceName}#${data.index} | ${data.action}`
            }

        }else if(msg.method=='canError'||msg.method=='udsError'){
            const data=msg.data as {ts: number, msg?: string}
            msg=`${data.msg||'error'}`
        }
        else{
            console.log(msg)
        }

    }else if(typeof msg === 'string'){
        msg=msg.trim()
        // msg=''
    }
    return fn(`[${timestamp}][${label}]:${msg}`);
});


function addLoggingOption(command: Command) {
    command
        .option('--log-level <level>', 'print log messages of given level and above only, error->warning->info->debug ', 'info')
        // .option('--log-file <file>', 'print log messages to file')
}

function createLog(level:string, file?:string){
    const t:(() => Transport)[]=[]
    const f=[]
    // const cliFormat = format.cli();
    const timestamp = format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' });
    t.push(()=>new transports.Console({level}))
    f.push(timestamp)
    f.push(myFormat)

    createLogs(t,f)
}



program.version(version).description('EcuBus-Pro command line tool')

// createCliLogs
const seq = program.command('seq').description('run uds sequence')
seq.argument('<project>', 'EcuBus-Pro project path')
seq.argument('<testerName>', 'tester name')
seq.option('-sn, --seqName <seqName>', 'spacial sequence name, empty run first sequence')
seq.option('-c, --cycle <number>', 'cycle number', '1')
addLoggingOption(seq)

seq.action(async (project, testerName, options) => {
    createLog(options.logLevel, options.logFile)
    try {
        const { data, projectPath, projectName } = await parseProject(project)
        await seqMain(projectPath, projectName, data, testerName, options.seqName, options.cycle)
    } catch (e: any) {
        sysLog.error(e.message||'failed to run sequence',)
        exit(1)
    }
})
program.parse();










